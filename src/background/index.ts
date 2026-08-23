/**
 * Taraweeh Companion — MentraOS miniapp (background layer).
 *
 * This is a thin client. All recognition (Quran corpus, IDF matcher, anchor
 * state machine, reading-pace timer) lives in the Taraweeh Companion backend
 * and is shared with the Even Realities G2 build, so a matcher fix ships to
 * both platforms from one deploy. The previous MentraOS app vendored a copy of
 * that engine and drifted ~60 commits behind; nothing is vendored here.
 *
 * The background layer is not Node and not a browser — it is a bare JS engine
 * (JavaScriptCore on iOS, QuickJS on Android). Only `fetch`, the native
 * WebSocket bridge, timers and the session API are available. No Buffer, no
 * DOM, no Node built-ins.
 */
import { registerMiniapp } from '@mentra/miniapp/background';

/** Backend that runs the recognition engine. Same deployment the G2 app uses. */
const BACKEND = 'wss://taraweeh-companion-g2-production-150e.up.railway.app/ws';

/** The engine expects 16 kHz mono signed 16-bit PCM. */
const EXPECTED_SAMPLE_RATE = 16000;

const RECONNECT_MS = 1500;
const DISPLAY_W = 576;
const DISPLAY_H = 288;

type Json = Record<string, unknown>;

registerMiniapp((session: any) => {
  let ws: any = null;
  let listening = false;
  let closing = false;
  let reconnectTimer: any = null;
  let offAudio: (() => void) | null = null;
  let warnedFormat = false;
  let warnedRate = false;
  let lastRender = '';
  let loggedRender = false;

  // ── Display ──────────────────────────────────────────────────────────────
  // One full-canvas text element, deliberately. G1 and Vuzix Z100 cannot place
  // elements at coordinates: the phone collapses every text element into a
  // single full-view layout in reading order. Splitting header and body into
  // two boxes therefore buys nothing on G1 and is what made the old build's
  // DoubleTextWall skew right. A text-first scene renders correctly everywhere
  // with no branching, so there is one element and one string.
  //
  // Render is diffed by element id, but guard on the text too: the backend
  // re-emits state on every tick and identical frames are not worth sending.
  function show(header: string, body: string) {
    const frame = header + '\n' + body;
    if (frame === lastRender) return;
    lastRender = frame;
    const d = session.capabilities?.display;
    const p = session.display.render([
      {
        type: 'text',
        id: 'verse',
        box: { x: 0, y: 0, w: d?.width ?? DISPLAY_W, h: d?.height ?? DISPLAY_H },
        text: frame,
        style: { breakMode: 'word', overflow: 'clip' },
      },
    ]);
    // Report once what the device did with the scene. On G1 `degraded` is
    // expected; anything in `dropped` or a "blocked" status is not.
    if (p && typeof p.then === 'function' && !loggedRender) {
      loggedRender = true;
      p.then((r: any) => {
        console.log(
          '[Taraweeh] first render — status=' + (r?.status ?? '?') +
          ' degraded=' + (r?.degraded ?? '?') +
          ' dropped=' + JSON.stringify(r?.dropped ?? []) +
          ' canPosition=' + (d?.canPosition ?? '?') +
          ' size=' + (d?.width ?? '?') + 'x' + (d?.height ?? '?'),
        );
      }, () => {});
    }
  }

  function showIdle() {
    show('Taraweeh Companion', 'Tap to start listening.');
  }

  // ── Verse rendering ──────────────────────────────────────────────────────
  // Field names mirror the backend's `state` message, the same payload the G2
  // app renders, so both platforms show the same thing.
  function renderState(state: any) {
    const translation = state.translationGlasses ?? state.translation ?? '';
    const translit = state.transliteration ?? '';
    const name = state.surahName || 'Quran';

    if (state.mode === 'LOCKED' || state.mode === 'PAUSED' || state.mode === 'RESUMING') {
      const pct = Math.round((state.confidence || 0) * 100);
      const ref = name + ' ' + state.surah + ':' + state.ayah;
      show(ref + '   ' + pct + '%', translation + (translit ? '\n\n' + translit : ''));
      return;
    }

    // Still searching, but a candidate is forming — show it without implying a lock.
    if (state.isCandidate && translation) {
      const ref = name + ' ' + state.surah + ':' + state.ayah;
      show(ref + '   ' + (state.candidateScore || 0) + '%', translation + '\n\nMatching…');
      return;
    }

    show('Listening…', 'Searching for the ayah…');
  }

  // ── Backend socket ───────────────────────────────────────────────────────
  function send(obj: Json) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function sendInit() {
    // Engine settings. Keys are read from miniapp settings so each user brings
    // their own, matching the G2 app: a shared pool would hit rate limits.
    send({
      type: 'init',
      audioSource: 'g2',
      pipelineVersion: 'v4',
      mode: 'taraweeh',
      taraweehMode: true,
      transcriptionProvider: setting('provider', 'groq'),
      groqApiKey: setting('groqApiKey', ''),
      openaiApiKey: setting('openaiApiKey', ''),
      lang: setting('lang', ''),
      preferredSurah: 0,
    });
  }

  function setting(key: string, fallback: string): string {
    try {
      const v = session.settings?.get?.(key);
      return typeof v === 'string' && v.trim() ? v.trim() : fallback;
    } catch {
      return fallback;
    }
  }

  function connect() {
    if (ws || closing) return;
    try {
      ws = new WebSocket(BACKEND);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('[Taraweeh] backend connected');
      sendInit();
      if (listening) send({ type: 'start' });
    };

    ws.onmessage = (ev: any) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'state' && msg.state) {
        renderState(msg.state);
      } else if (msg.type === 'error') {
        console.log('[Taraweeh] backend error:', msg.error);
        show('Problem', String(msg.error || 'Backend error'));
      } else if (msg.type === 'sys_status' && msg.component === 'model' && msg.status === 'error') {
        // Surface a bad or missing key rather than sitting on "Searching…".
        show('Check your API key', String(msg.message || 'Transcription failed'));
      }
    };

    ws.onclose = () => {
      ws = null;
      if (!closing) scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose follows and owns the reconnect.
      console.log('[Taraweeh] socket error');
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer || closing) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_MS);
  }

  // ── Microphone ───────────────────────────────────────────────────────────
  function startAudio() {
    if (offAudio) return;
    offAudio = session.mic.onAudioChunk((chunk: any) => {
      if (!listening) return;

      // The host may hand back LC3 instead of PCM. There is no LC3 decoder in a
      // bare JS engine, and forwarding it would reach Whisper as noise, so say
      // so plainly instead of failing silently.
      if (chunk.format && !/pcm/i.test(String(chunk.format))) {
        if (!warnedFormat) {
          warnedFormat = true;
          console.log('[Taraweeh] unsupported mic format:', chunk.format);
          show('Unsupported audio', 'Phone is sending ' + chunk.format + ', not PCM.');
        }
        return;
      }
      if (chunk.sampleRate && chunk.sampleRate !== EXPECTED_SAMPLE_RATE && !warnedRate) {
        warnedRate = true;
        console.log('[Taraweeh] mic sample rate is', chunk.sampleRate, 'expected', EXPECTED_SAMPLE_RATE);
      }

      // chunk.data is already base64 PCM, which is exactly the frame shape the
      // backend accepts — no decode, no binary frame needed.
      if (ws && ws.readyState === 1 && chunk.data) {
        ws.send(JSON.stringify({ t: 'a', d: chunk.data }));
      }
    });
  }

  function stopAudio() {
    if (offAudio) {
      try { offAudio(); } catch {}
      offAudio = null;
    }
  }

  // ── Control ──────────────────────────────────────────────────────────────
  function startListening() {
    if (listening) return;
    listening = true;
    lastRender = '';
    show('Listening…', 'Searching for the ayah…');
    connect();
    send({ type: 'start' });
    startAudio();
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    stopAudio();
    send({ type: 'stop' });
    // Socket stays open: reconnecting costs a full pipeline rebuild on resume.
    lastRender = '';
    showIdle();
  }

  // ── Input ────────────────────────────────────────────────────────────────
  session.input.onTouch((touch: any) => {
    switch (touch.kind) {
      case 'single_tap':
        if (listening) stopListening(); else startListening();
        break;
      case 'swipe_up':
        send({ type: 'manual_prev' });
        break;
      case 'swipe_down':
        send({ type: 'manual_advance' });
        break;
      default:
        break;
    }
  });

  session.input.onButtonPress((press: any) => {
    if (press.pressType === 'long') stopListening();
    else if (listening) stopListening();
    else startListening();
  });

  session.events?.onDisconnected?.(() => {
    closing = true;
    stopAudio();
    try { ws && ws.close(); } catch {}
    ws = null;
  });

  connect();
  showIdle();
});
