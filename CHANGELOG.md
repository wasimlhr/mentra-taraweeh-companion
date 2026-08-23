# Changelog

## 3.0.6 - 2026-08-23

Rewritten as a **thin `@mentra/miniapp` client** on the shared backend.

- MentraOS 3.0 replaced the cloud SDK — apps moved on-device — so the previous
  `@mentra/sdk` app stopped running. There is no published migration guide, so
  this is a rewrite rather than a version bump.
- **Nothing is vendored any more.** This repo carried its own copy of the
  recognition engine, roughly 60 commits behind the G2 build and missing every
  fix since v2.6.7 — including the one that stops Bismillah locking onto
  Al-Fatiha, and the spoken-form repairs for garbled Whisper output. The
  miniapp now uses the same backend as the G2 app, so one deploy serves both.
- `session.mic.onAudioChunk` returns base64 PCM, forwarded verbatim as
  `{"t":"a","d":"<base64>"}`. No decoding on-device: the background layer is a
  bare JS engine (JavaScriptCore / QuickJS) with no `Buffer` and no DOM.
- Display is a **single full-canvas text element**. G1 and Vuzix Z100 cannot
  position elements, so the phone collapses text into one full-view layout —
  which is what skewed the old `DoubleTextWall` right on G1. Text-first renders
  correctly everywhere with no branching.
- LC3 is detected and reported rather than forwarded, since no decoder is
  available in this runtime.
- Removed the vendored `backend/`, the `@mentra/sdk` session layer, and the
  cloud-hosting files (`Dockerfile`, `railway.toml`, `app_config.json`).

Version now tracks the shared engine (3.0.6) rather than its own line, since
recognition behaviour comes from the backend.

**Not yet run on hardware.** The backend transport is verified end to end; the
SDK surface — display, mic, input — is written against the current docs and
needs a device to confirm.

## 1.0.1 - 2026-07-21

- Synced the Quran matcher and initial-lock improvements from pipeline 2.6.7.
- Added G1/G2-aware microphone gating and lower-noise transcription scheduling.
- Fixed Taraweeh timer freezes with visible, bounded recitation resync.
- Preserved Mentra pause behavior and non-disruptive Groq rate-limit alerts.
