import { describe, expect, test } from 'bun:test';
import { MAX_AUDIO_MESSAGES_PER_SECOND, createFixedWindowLimiter, isSecureBackendUrl, parseServerMessage, publicErrorText, validAudioChunk } from './protocol';

describe('secured backend protocol', () => {
  test('allows only credential-free wss /ws endpoints', () => {
    expect(isSecureBackendUrl('wss://example.test/ws')).toBe(true);
    expect(isSecureBackendUrl('ws://example.test/ws')).toBe(false);
    expect(isSecureBackendUrl('ws://localhost:8787/ws')).toBe(true);
    expect(isSecureBackendUrl('wss://user:pass@example.test/ws')).toBe(false);
    expect(isSecureBackendUrl('wss://example.test/other')).toBe(false);
  });

  test('accepts known structured messages and rejects malformed or unknown input', () => {
    expect(parseServerMessage('{"type":"match_progress","whisperText":"heard"}')?.type).toBe('match_progress');
    expect(parseServerMessage('{"type":"state","state":null}')).toBeNull();
    expect(parseServerMessage('{"type":"internal_secret"}')).toBeNull();
    expect(parseServerMessage('not json')).toBeNull();
  });

  test('bounds and validates base64 audio before transport', () => {
    expect(validAudioChunk({ data: 'AAAAAA==' })).toBe(true);
    expect(validAudioChunk({ data: 'AA==' })).toBe(false);
    expect(validAudioChunk({ data: 'AAAAAA==', channels: 2 })).toBe(false);
    expect(validAudioChunk({ data: 'not base64!' })).toBe(false);
    expect(validAudioChunk({ data: 'A'.repeat(256 * 1024 + 4) })).toBe(false);
  });

  test('enforces and resets the audio message-rate ceiling', () => {
    let now = 10;
    const allow = createFixedWindowLimiter(MAX_AUDIO_MESSAGES_PER_SECOND, 1000, () => now);
    for (let i = 0; i < MAX_AUDIO_MESSAGES_PER_SECOND; i++) expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    now += 1000;
    expect(allow()).toBe(true);
  });

  test('maps backend failures to non-secret user messages', () => {
    expect(publicErrorText({ code: 'UNAUTHORIZED', error: 'key=secret' })).not.toContain('secret');
    expect(publicErrorText({ code: 'SHARED_QUOTA_EXCEEDED' })).toContain('limit');
  });
});
