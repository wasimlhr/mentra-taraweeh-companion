const MAX_SERVER_MESSAGE_CHARS = 256 * 1024;
const MAX_AUDIO_BYTES = 64 * 1024;
export const MAX_AUDIO_MESSAGES_PER_SECOND = 100;

// No `new URL()` here: the background layer is a bare JS engine
// (JavaScriptCore / QuickJS) where the WHATWG URL constructor does not exist.
// Using it threw a ReferenceError, the catch returned false, and the app
// declared its own hard-coded wss:// backend "insecure" — permanently dead on
// device while every Bun/browser test passed. Parse with regexes instead.
export function isSecureBackendUrl(value: string): boolean {
  if (typeof value !== 'string') return false;
  // scheme://authority/ws — authority may not contain credentials (@), a path,
  // query, fragment, or backslash trickery.
  const m = value.match(/^(wss?):\/\/([^/\\?#@]+)\/ws$/i);
  if (!m) return false;
  const authority = m[2];
  // host[:port] with an optional bracketed IPv6 literal
  const hp = authority.match(/^(\[[0-9A-Fa-f:.]+\]|[^:\[\]]+)(?::(\d{1,5}))?$/);
  if (!hp) return false;
  const host = hp[1].toLowerCase().replace(/^\[|\]$/g, '');
  if (m[1].toLowerCase() === 'wss') return true;
  // Plain ws:// is development-only, toward loopback.
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

// Minimal UTF-8 decoder: TextDecoder is a Web API and does not exist in the
// bare background JS engine. Malformed sequences produce garbage characters,
// which then fail JSON.parse and are rejected — good enough for this path.
function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if ((b & 0xe0) === 0xc0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if ((b & 0xf0) === 0xe0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

/**
 * Native WebSocket bridges disagree about what onmessage receives for a text
 * frame: a JSON string, bytes, or an already-parsed object. On-device the
 * MentraOS bridge does not hand back a plain string, so a string-only parser
 * rejected every backend message and the app looked permanently offline.
 * Normalize all three shapes, then validate identically.
 */
export function parseServerMessage(data: unknown): Record<string, any> | null {
  let value: any = data;
  if (value instanceof ArrayBuffer) {
    value = decodeUtf8(new Uint8Array(value));
  } else if (ArrayBuffer.isView(value)) {
    value = decodeUtf8(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (typeof value === 'string') {
    if (value.length > MAX_SERVER_MESSAGE_CHARS) return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.type !== 'string') return null;
  // No type allowlist: the shared backend evolves ahead of installed clients
  // and emits kinds this build has no handler for (audio_profile, quota, …).
  // An allowlist here turned every one of those into a "protocol error", and
  // three of them closed a healthy connection — the app looked permanently
  // offline. Structure is validated; unknown types are for the caller to
  // ignore, exactly as the G2 app does.
  if (value.type === 'state' && (!value.state || typeof value.state !== 'object' || Array.isArray(value.state))) return null;
  return value;
}

export function validAudioChunk(chunk: unknown): chunk is { data: string; format?: unknown; sampleRate?: unknown } {
  if (!chunk || typeof chunk !== 'object') return false;
  const value = chunk as any;
  if (value.format && !/pcm/i.test(String(value.format))) return false;
  if (value.channels != null && value.channels !== 1) return false;
  let data = value.data;
  if (typeof data !== 'string' || !data.length) return false;
  // Bridges differ in base64 dialect: accept URL-safe and unpadded variants
  // by normalizing to standard padded base64 (written back so the backend
  // receives the canonical form).
  if (/[-_]/.test(data)) data = data.replace(/-/g, '+').replace(/_/g, '/');
  if (data.length % 4 !== 0) data += '='.repeat(4 - (data.length % 4));
  if (data.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) return false;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const bytes = data.length / 4 * 3 - padding;
  if (bytes > MAX_AUDIO_BYTES || bytes % 2 !== 0) return false;
  value.data = data;
  return true;
}

export function createFixedWindowLimiter(limit: number, windowMs: number, now = () => Date.now()) {
  let started = 0;
  let used = 0;
  return () => {
    const current = now();
    if (!started || current - started >= windowMs) { started = current; used = 0; }
    if (used >= limit) return false;
    used += 1;
    return true;
  };
}

export function publicErrorText(msg: Record<string, any>): string {
  const code = typeof msg.code === 'string' ? msg.code : '';
  if (/KEY|AUTH|FORBIDDEN|UNAUTHORIZED/i.test(code)) return 'Transcription authorization failed. Check your API key.';
  if (/RATE|QUOTA|CONCURRENCY/i.test(code)) return 'Transcription limit reached. Try again later or use your own key.';
  if (/PCM|AUDIO|PAYLOAD|MESSAGE|JSON/i.test(code)) return 'The backend rejected an invalid audio or control message.';
  return 'The recognition service reported a problem. Please retry.';
}
