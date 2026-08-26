const MAX_SERVER_MESSAGE_CHARS = 256 * 1024;
const MAX_AUDIO_BYTES = 64 * 1024;
export const MAX_AUDIO_MESSAGES_PER_SECOND = 100;
const ALLOWED_SERVER_TYPES = new Set([
  'connected', 'backend_version', 'pipeline_version', 'pace', 'sys_status',
  'match_progress', 'recovery_state', 'state', 'error', 'pong',
]);

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

export function parseServerMessage(data: unknown): Record<string, any> | null {
  if (typeof data !== 'string' || data.length > MAX_SERVER_MESSAGE_CHARS) return null;
  try {
    const value = JSON.parse(data);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (typeof value.type !== 'string' || !ALLOWED_SERVER_TYPES.has(value.type)) return null;
    if (value.type === 'state' && (!value.state || typeof value.state !== 'object' || Array.isArray(value.state))) return null;
    return value;
  } catch {
    return null;
  }
}

export function validAudioChunk(chunk: unknown): chunk is { data: string; format?: unknown; sampleRate?: unknown } {
  if (!chunk || typeof chunk !== 'object') return false;
  const value = chunk as any;
  const data = value.data;
  if (value.format && !/pcm/i.test(String(value.format))) return false;
  if (value.channels != null && value.channels !== 1) return false;
  if (typeof data !== 'string' || !data.length || data.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) return false;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const bytes = data.length / 4 * 3 - padding;
  return bytes <= MAX_AUDIO_BYTES && bytes % 2 === 0;
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
