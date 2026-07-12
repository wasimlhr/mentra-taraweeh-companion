import type { AppSession } from '@mentra/sdk';

export type TaraweehSettings = {
  reciteMode: 'taraweeh' | 'practice';
  preferredSurah: number;
  glassesBottom: 'transliteration' | 'translation-only';
  fastMode: boolean;
  slowMode: boolean;
  keyMode: 'shared' | 'byok';
  transcriptionProvider: 'groq' | 'openai';
  groqApiKey: string;
  openaiApiKey: string;
};

const DEFAULTS: TaraweehSettings = {
  reciteMode: 'taraweeh',
  preferredSurah: 0,
  glassesBottom: 'transliteration',
  fastMode: false,
  slowMode: false,
  keyMode: 'shared',
  transcriptionProvider: 'groq',
  groqApiKey: '',
  openaiApiKey: '',
};

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return fallback;
}

function clampSurah(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 114) return 114;
  return Math.floor(n);
}

export function readTaraweehSettings(session: AppSession): TaraweehSettings {
  const s = session.settings;
  const reciteRaw = String(s.get('recite_mode', DEFAULTS.reciteMode)).toLowerCase().trim();
  const surahRaw = parseInt(String(s.get('preferred_surah', '0')), 10);
  const bottomRaw = String(s.get('glasses_bottom', DEFAULTS.glassesBottom));
  const keyModeRaw = String(s.get('key_mode', DEFAULTS.keyMode));
  const providerRaw = String(s.get('transcription_provider', DEFAULTS.transcriptionProvider));

  // Mentra select values should be "practice" | "taraweeh"; accept loose labels too.
  const reciteMode: TaraweehSettings['reciteMode'] =
    reciteRaw === 'practice' || reciteRaw.includes('practice')
      ? 'practice'
      : 'taraweeh';

  return {
    reciteMode,
    preferredSurah: clampSurah(surahRaw),
    glassesBottom:
      bottomRaw === 'translation-only' ? 'translation-only' : 'transliteration',
    fastMode: asBool(s.get('fast_mode', DEFAULTS.fastMode), DEFAULTS.fastMode),
    slowMode: asBool(s.get('slow_mode', DEFAULTS.slowMode), DEFAULTS.slowMode),
    keyMode: keyModeRaw === 'byok' ? 'byok' : 'shared',
    transcriptionProvider: providerRaw === 'openai' ? 'openai' : 'groq',
    groqApiKey: String(s.get('groq_api_key', '') || '').trim(),
    openaiApiKey: String(s.get('openai_api_key', '') || '').trim(),
  };
}

export type WhisperOpts = {
  provider: string;
  apiKey: string;
  sharedMode?: boolean;
};

/** Mirrors taraweeh-companion/backend/server.js createPipeline key routing. */
export function resolveWhisperOpts(settings: TaraweehSettings): WhisperOpts {
  const sharedGroq = (process.env.SHARED_GROQ_KEY || '').trim();
  const sharedOpenai = (process.env.SHARED_OPENAI_KEY || '').trim();
  const { groqApiKey, openaiApiKey, keyMode, transcriptionProvider } = settings;

  if (keyMode === 'byok') {
    if (transcriptionProvider === 'openai' && openaiApiKey) {
      return { provider: 'openai', apiKey: openaiApiKey };
    }
    if (transcriptionProvider === 'groq' && groqApiKey) {
      return { provider: 'groq', apiKey: groqApiKey };
    }
    console.warn('[Settings] BYOK mode but key empty — trying shared keys');
  }

  if (sharedGroq || sharedOpenai) {
    return { provider: 'groq', apiKey: '', sharedMode: true };
  }

  if (openaiApiKey) return { provider: 'openai', apiKey: openaiApiKey };
  if (groqApiKey) return { provider: 'groq', apiKey: groqApiKey };

  return { provider: 'groq', apiKey: '' };
}

export function settingsToSessionOptions(settings: TaraweehSettings) {
  const whisperOpts = resolveWhisperOpts(settings);
  return {
    preferredSurah: settings.preferredSurah,
    taraweehMode: settings.reciteMode === 'taraweeh',
    practiceMode: settings.reciteMode === 'practice',
    fastMode: settings.fastMode,
    slowMode: settings.slowMode,
    glassesBottom: settings.glassesBottom,
    whisperOpts,
  };
}

export function watchTaraweehSettings(
  session: AppSession,
  onChange: (settings: TaraweehSettings) => void,
): () => void {
  const keys = [
    'recite_mode',
    'preferred_surah',
    'glasses_bottom',
    'fast_mode',
    'slow_mode',
    'key_mode',
    'transcription_provider',
    'groq_api_key',
    'openai_api_key',
  ] as const;

  const cleanups = keys.map((key) =>
    session.settings.onValueChange(key, () => {
      onChange(readTaraweehSettings(session));
    }),
  );

  return () => cleanups.forEach((fn) => fn());
}
