import type { AppSession } from '@mentra/sdk';
import { StreamType } from '@mentra/sdk';
import { Buffer } from 'node:buffer';
import { AudioPipeline } from '../backend/audioPipelineV4.js';
import { loadQuran } from '../backend/keywordMatcher.js';
import {
  buildGlassesText,
  formatForMentra,
  type GlassesDisplay,
  type VerseDisplayState,
} from './glassesDisplay.js';
import type { WhisperOpts } from './settings.js';

type PipelineMsg = {
  type: string;
  state?: VerseDisplayState & { timerMs?: number };
  [key: string]: unknown;
};

export type SessionControllerOptions = {
  preferredSurah?: number;
  fastMode?: boolean;
  slowMode?: boolean;
  taraweehMode?: boolean;
  practiceMode?: boolean;
  translationLang?: string;
  glassesBottom?: 'transliteration' | 'translation-only';
  whisperOpts?: WhisperOpts;
};

let quranLoaded = false;
function ensureQuranLoaded() {
  if (quranLoaded) return;
  console.log('[Mentra] Loading Quran corpus…');
  loadQuran();
  // Skip mushaf index — large and unused by Mentra glasses display path.
  quranLoaded = true;
  console.log('[Mentra] Quran corpus ready');
}

export class MentraTaraweehSession {
  private pipeline: InstanceType<typeof AudioPipeline> | null = null;
  private display: GlassesDisplay | null = null;
  private pageIdx = 0;
  private pageTimer: ReturnType<typeof setTimeout> | null = null;
  private lastState: VerseDisplayState | null = null;
  private lockingDots = 0;
  private lockingTimer: ReturnType<typeof setInterval> | null = null;
  private cleanups: Array<() => void> = [];
  private opts: SessionControllerOptions;

  constructor(
    private session: AppSession,
    opts: SessionControllerOptions = {},
  ) {
    this.opts = { ...opts };
  }

  start() {
    ensureQuranLoaded();
    this.attachHandlers();
    this.createPipeline();
    void this.showWelcome();
  }

  applySettings(next: SessionControllerOptions) {
    this.opts = { ...this.opts, ...next };
    this.pageIdx = 0;
    this.lastState = null;
    this.display = null;
    this.createPipeline();
    console.log('[Mentra] Settings applied — pipeline recreated');
  }

  destroy() {
    this.stopPageFlip();
    this.stopLockingDots();
    if (this.pipeline) {
      this.pipeline.destroy();
      this.pipeline = null;
    }
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
  }

  getLiveSnapshot() {
    const reciteMode = this.opts.practiceMode
      ? 'practice'
      : 'taraweeh';
    const s = this.lastState;
    if (!s) {
      return {
        active: true,
        reciteMode,
        mode: 'SEARCHING',
        ref: 'Listening…',
        arabic: '',
        transliteration: '',
        translation: '',
        confidence: null as number | null,
        state: { mode: 'SEARCHING' },
      };
    }
    const name = s.surahName || 'Quran';
    const ref =
      s.surah && s.ayah ? `${name} ${s.surah}:${s.ayah}` : name;
    // Plain JSON only — Mentra phone UI polls this every second.
    let safeState: Record<string, unknown> = { mode: s.mode || 'SEARCHING' };
    try {
      safeState = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    } catch {
      safeState = {
        mode: s.mode,
        surah: s.surah,
        ayah: s.ayah,
        surahName: s.surahName,
        arabic: s.arabic,
        transliteration: s.transliteration,
        translation: s.translationGlasses || s.translation,
        confidence: s.confidence,
        isCandidate: s.isCandidate,
      };
    }
    return {
      active: true,
      reciteMode,
      mode: s.mode || 'SEARCHING',
      ref,
      arabic: s.arabic || '',
      transliteration: s.transliteration || '',
      translation: s.translationGlasses || s.translation || '',
      confidence: typeof s.confidence === 'number' ? s.confidence : null,
      state: safeState,
    };
  }

  /** Switch Taraweeh ↔ Practice without tearing down the Mentra session. */
  setReciteMode(mode: 'taraweeh' | 'practice') {
    const practice = mode === 'practice';
    this.opts.practiceMode = practice;
    this.opts.taraweehMode = !practice;
    if (!this.pipeline) return;
    if (practice) {
      this.pipeline.setPracticeMode?.(true);
    } else {
      this.pipeline.setTaraweehMode?.(true);
    }
    console.log(`[Mentra] Recite mode → ${mode}`);
  }

  manualNext() {
    this.pipeline?.manualAdvance?.();
  }

  manualPrev() {
    this.pipeline?.manualPrev?.();
  }

  pause() {
    this.pipeline?.pause?.();
  }

  resume() {
    this.pipeline?.audioReturn?.();
  }

  resetSearch() {
    this.pipeline?.reset?.();
    this.pageIdx = 0;
    this.display = null;
    this.lastState = null;
    void this.session.layouts.showTextWall('Reset — searching…');
  }

  togglePause() {
    if (this.lastState?.mode === 'PAUSED') {
      this.resume();
    } else {
      this.pause();
    }
  }

  private attachHandlers() {
    this.cleanups.push(
      this.session.events.onAudioChunk((chunk) => {
        if (!this.pipeline?.active) {
          this.pipeline?.start();
        }
        const buf = Buffer.from(chunk.arrayBuffer);
        this.pipeline?.ingest(buf);
      }),
    );

    this.cleanups.push(
      this.session.events.onButtonPress((data) => {
        if (data.pressType === 'long') {
          // Long press toggles pause / resume
          this.togglePause();
          return;
        }
        this.onShortTap();
      }),
    );

    this.cleanups.push(
      this.session.events.onPermissionError((err) => {
        console.error('[Mentra] Permission error:', err);
        void this.session.layouts.showTextWall(
          'Mic permission required.\nEnable in console.mentra.glass',
        );
      }),
    );
  }

  private onShortTap() {
    if (
      this.display &&
      this.display.pages.length > 1 &&
      this.pageIdx < this.display.pages.length - 1
    ) {
      this.pageIdx++;
      void this.pushDisplay();
      return;
    }
    if (this.lastState?.mode === 'PAUSED') {
      this.resume();
      return;
    }
    this.pipeline?.manualAdvance?.();
  }

  private createPipeline() {
    if (this.pipeline) {
      this.pipeline.destroy();
      this.pipeline = null;
    }

    const whisperOpts = this.opts.whisperOpts ?? { provider: 'groq', apiKey: '' };
    const preferredSurah = this.opts.preferredSurah ?? 0;

    if (!whisperOpts.apiKey && !whisperOpts.sharedMode) {
      console.warn('[Mentra] No transcription key — set SHARED_* in .env or BYOK in app settings');
    }

    this.pipeline = new AudioPipeline({
      preferredSurah,
      translationLang: this.opts.translationLang ?? '',
      whisperOpts,
      geminiKey: process.env.GEMINI_API_KEY,
      onStateUpdate: (msg: PipelineMsg) => this.handlePipelineMessage(msg),
      onStatus: (s) => {
        if (s.type === 'taraweeh_mode' || s.type === 'practice_mode') return;
        console.log('[Pipeline status]', s);
      },
      onError: (err: string) => {
        console.error('[Pipeline]', err);
        void this.session.layouts.showTextWall(`Error: ${err}`);
      },
    });

    if (this.pipeline.setFastMode) this.pipeline.setFastMode(!!this.opts.fastMode);
    if (this.pipeline.setSlowMode) this.pipeline.setSlowMode(!!this.opts.slowMode);
    // Always set both explicitly — pipeline defaults are both false.
    if (this.opts.practiceMode) {
      this.pipeline.setPracticeMode?.(true);
    } else {
      this.pipeline.setTaraweehMode?.(true);
    }

    this.pipeline.start();
    console.log(
      `[Mentra] Pipeline v4 mode=${this.opts.practiceMode ? 'practice' : 'taraweeh'} ` +
        `(provider=${whisperOpts.provider}, shared=${!!whisperOpts.sharedMode}, surah hint=${preferredSurah})`,
    );
  }

  private handlePipelineMessage(msg: PipelineMsg) {
    if (msg.type === 'ameen') {
      void this.session.layouts.showTextWall('Āmīn', { durationMs: 2500 });
      return;
    }

    if (msg.type === 'taraweeh') {
      const t = msg as { position?: string; rakat?: number };
      if (t.position) {
        void this.session.layouts.showTextWall(
          `${t.position}${t.rakat ? ` · Rakʿah ${t.rakat}` : ''}`,
          { durationMs: 3000 },
        );
      }
      return;
    }

    if (msg.type !== 'state' || !msg.state) return;

    const state = { ...msg.state };
    if (state.isCandidate) {
      this.startLockingDots();
    } else {
      this.stopLockingDots();
    }
    state._lockingDots = this.lockingDots;

    const prev = this.lastState;
    this.lastState = state;

    const verseChanged =
      !prev ||
      prev.surah !== state.surah ||
      prev.ayah !== state.ayah ||
      prev.mode !== state.mode ||
      (prev.mode === 'LOCKED' && state.mode !== 'LOCKED');

    if (verseChanged) {
      this.pageIdx = 0;
      this.display = buildGlassesText(state, {
        glassesBottom: this.opts.glassesBottom,
      });
      void this.pushDisplay();

      const timerMs = msg.state.timerMs;
      if (timerMs && timerMs > 0 && this.display.pages.length > 1) {
        this.startPageFlip(timerMs);
      } else {
        this.stopPageFlip();
      }
    } else if (msg.state.timerMs) {
      void this.pushDisplay(msg.state.timerMs);
    }
  }

  private async pushDisplay(remainingMs?: number) {
    if (!this.display) return;
    const { title, text } = formatForMentra(this.display, this.pageIdx);
    let hdr = title;
    if (remainingMs && remainingMs > 0) {
      const secs = Math.ceil(remainingMs / 1000);
      hdr = `${title} · ${secs}s`;
    }
    const body = (text || ' ').trim() || ' ';
    // Single full TextWall. Mentra still left-aligns; HUD size is MentraOS
    // Display Height — we can't move the container, only fill it with text.
    const wall = `${hdr}\n────────\n${body}`;
    try {
      this.session.layouts.showTextWall(wall, { priority: true });
      console.log(`[Mentra] Glasses ← ${hdr.slice(0, 48)}`);
    } catch (err) {
      console.error('[Mentra] Glasses display failed:', err);
    }
  }

  private startPageFlip(totalMs: number) {
    this.stopPageFlip();
    if (!this.display || this.display.pages.length <= 1) return;
    const perPage = Math.max(1500, Math.floor(totalMs / this.display.pages.length));
    this.pageTimer = setInterval(() => {
      if (!this.display) return;
      if (this.pageIdx < this.display.pages.length - 1) {
        this.pageIdx++;
        void this.pushDisplay();
      } else {
        this.stopPageFlip();
      }
    }, perPage);
  }

  private stopPageFlip() {
    if (this.pageTimer) {
      clearInterval(this.pageTimer);
      this.pageTimer = null;
    }
  }

  private startLockingDots() {
    if (this.lockingTimer) return;
    this.lockingDots = 0;
    this.lockingTimer = setInterval(() => {
      this.lockingDots = (this.lockingDots + 1) % 4;
    }, 400);
  }

  private stopLockingDots() {
    if (this.lockingTimer) {
      clearInterval(this.lockingTimer);
      this.lockingTimer = null;
    }
    this.lockingDots = 0;
  }

  private async showWelcome() {
    const mode = this.opts.taraweehMode ? 'Taraweeh' : 'Practice';
    const surah = this.opts.preferredSurah ? `Surah ${this.opts.preferredSurah}` : 'Auto surah';
    try {
      this.session.layouts.showTextWall(
        `Quran Companion\n${mode} · ${surah}\nListening…\n\nTap: next / resume\nLong press: pause`,
      );
    } catch (err) {
      console.error('[Mentra] Welcome display failed:', err);
    }
  }
}

export function subscribeToMic(session: AppSession) {
  session.subscribe(StreamType.AUDIO_CHUNK);
}
