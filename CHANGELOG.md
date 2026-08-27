# Changelog

## 3.3.4 - 2026-08-26

Audited release — a line-by-line review of every change since the on-device
fixes, verified against a bridge-shim harness replaying the backend's real
message cadence (including the emit-before-schedule order and PAUSED states):
~5 minutes of randomized stress with zero bar violations and zero JS errors.

- **The timer bar no longer pins at ~100% from the second ayah onward.**
  The backend emits a new ayah's first state BEFORE arming its timer; the
  timerless transition landed the fresh timer in the same-ayah branch
  seeded with the previous ayah's completed fill. The bar now tracks which
  ayah it belongs to (`barKey`): a timerless new ayah shows empty and the
  timer-carrying heartbeat starts the sweep from zero.
- **The bar freezes during pause/ruku instead of running through it**, and
  resumes from the frozen fill.
- **A prev/next flip (A→B→A) continues A's bar** — the reappear-memo is a
  small map now, so B's stash no longer destroys A's; a remembered fill at
  ~full is not resumed (a genuine re-recitation starts fresh).
- **Practice mode shows plain Arabic** — karaoke is disabled there
  (nothing advances the word position, so the verse sat dimmed with the
  first word gold forever).
- **Rate limits no longer masquerade as key errors**: model failures are
  classified (rate limit / key / other) instead of always saying "check
  your API key".
- The tashkeel toggle ignores in-flight status echoes briefly so it can't
  visibly revert; mic frames in URL-safe or unpadded base64 are normalized
  instead of dropped.

## 3.3.3 - 2026-08-26

- **A re-shown ayah continues its timer bar instead of restarting.** A
  surah-complete flash or a back-correct clears/flips the verse and can
  re-show the SAME ayah moments later — the last ayah of a surah visibly
  "reset twice". The tile now remembers the bar fill of the ayah it just
  left (6 s window) and continues from there when that exact ayah returns;
  a genuinely new ayah still gets its single fresh sweep. Verified in the
  bridge-shim harness: 33% before the flash → continues at 40% after the
  re-lock → clean reset only on the next ayah. (Pairs with the backend's
  3.3.3 word-clock fix, which stops new ayahs appearing mid-word.)

## 3.3.2 - 2026-08-26

- **The ayah timer bar sweeps once per ayah again.** The bar restarted its
  animation fraction from zero on every 500 ms state heartbeat (each
  carries a fresh *remaining* duration), so it pulsed in tiny fills —
  roughly once per word at normal pace, which read as "every word gets its
  own timer" once the karaoke highlight drew the eye there. The bar now
  CONTINUES from its current fill toward 100 % over the pushed remaining
  time, re-syncs only when the backend genuinely disagrees with the
  running animation (re-phase, pace nudge), never jumps backward within an
  ayah, and resets exactly once on an ayah change. Driven by an interval
  instead of requestAnimationFrame, which starves in dimmed WebViews.
  Verified in a bridge-shim harness: monotonic 0→50 % over half an 8 s
  ayah under heartbeats + word pushes, zero backward drops, single clean
  reset on ayah change.

## 3.3.1 - 2026-08-26

- **The heard line shows real Quranic marks.** Whisper output is always
  bare; the backend now maps recognized words to their diacritized corpus
  spelling and the tile prefers that version. Unrecognized words stay
  exactly as Whisper wrote them. A recognized isti'adhah/bismillah shows
  the fully vocalized phrase.
- **Settings → Quranic marks (tashkeel), on by default.** "Plain text"
  strips the combining marks from the verse card and the heard line for
  display only; word count is untouched so the karaoke highlight is
  unaffected. Persisted like every other setting.
- The Arabic font stack gains full-mark system fallbacks (Noto Naskh
  Arabic, Geeza Pro) in case the bundled Amiri subset misses a glyph.

## 3.3.0 - 2026-08-26

- **Karaoke word tracking in the tile's Arabic text.** Recited words render
  at full strength, the current word glows gold, upcoming words sit dimmed.
  No new recognition and no new cost: once locked the text is known, so this
  is alignment — the shared backend interpolates the word position from its
  measured pace and snap-corrects from Whisper word timestamps, streaming
  `wordProgress` at 5 Hz. The background forwards only changed positions to
  the tile; spans are built once per ayah and only the highlight moves.
  Candidates stay plain — the highlight must not imply certainty that does
  not exist yet. (Matches the G2 app's 3.3.0.)

## 3.2.2 - 2026-08-26

- **Unknown backend message kinds are ignored, not fatal.** The hardened
  parser allowlisted ten message types, but the shared backend emits kinds
  this client has no handler for (`audio_profile`, quota notices, …); each
  one counted as a protocol error and three of them closed a healthy
  connection — the 3.2.1 shape diagnostic caught `audio_profile` as the
  very first message after connect. The parser still rejects malformed
  input (non-JSON, no `type`, oversized, bad `state` shape), but unknown
  types now pass through to the handler, which ignores what it does not
  know — the same forward-compatibility rule the G2 app follows, because
  the backend deploys ahead of installed clients by design.

## 3.2.1 - 2026-08-26

- **Backend messages are actually read on-device.** The phone's native
  WebSocket bridge does not hand `onmessage` a DOM-style event with a string
  `.data` — the string-only parser therefore rejected every backend message
  as `INVALID_SERVER_MESSAGE`, tripped the 3-failure disconnect, and the app
  cycled connect → reject → close forever, showing "Offline" in the tile
  (confirmed via the dev sidecar's live device logs). `parseServerMessage`
  now normalizes all bridge shapes — a JSON string, a pre-parsed object, or
  UTF-8 bytes (with a local decoder; `TextDecoder` does not exist in the bare
  engine) — and `onmessage` unwraps event-or-payload. A one-time diagnostic
  logs the payload shape if parsing ever fails again.

## 3.2.0 - 2026-08-25

- **The app can now actually connect on-device.** `isSecureBackendUrl` used
  `new URL()` — a WHATWG API that does not exist in the bare background JS
  engine (JavaScriptCore/QuickJS). On glasses it threw, the catch returned
  false, and the app declared its own hard-coded `wss://` backend "insecure"
  and died with no retry, while every Bun/browser test passed. The check now
  parses with regexes.
- **Session teardown runs.** Cleanup was registered on
  `session.events.onDisconnected`, which is not an SDK API — the optional
  chaining made it a silent no-op, so the mic subscription, reconnect timer
  and backend socket all outlived the session. Now registered on
  `onBeforeDisconnect` and `on('disconnect')`, the real hooks.
- **A half-typed key can no longer clobber the saved one.** Every settings tap
  pushed the key input's current text; the background adopted any non-empty
  value. The key now travels only on an explicit Save.
- The protocol-failure disconnect uses close code 4002 (1002 is reserved and
  `close()` throws on it — the socket never actually closed), and invalid mic
  frames no longer count toward tearing down a healthy backend connection.
- Stale "Locked · N%" pill and ayah card are cleared when the engine returns
  to searching (reset, lost lock).
- The verse progress bar restarts when the ayah changes, not only when the
  duration differs — equal-length consecutive ayahs froze it at 100%.
- Config restore runs its storage reads in parallel, shrinking the window
  where an early tap wrongly reported "API key needed".
- Isti'adhah / bismillah are named when heard — the search card and the
  glasses show *A'udhu billah ✓* / *Bismillah ✓* instead of a generic
  "Searching…" (requires backend ≥ 3.2.0; older backends simply keep the raw
  heard line).
- A basmala lock shows **"Bismillah"**, not "Al-Fatihah 1:1 of 7", on the tile
  and the glasses — 1:1 locks whenever a reciter opens any surah.

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
