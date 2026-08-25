# Metro live microphone decoded-text flow

The MentraOS miniapp is a client of the shared Taraweeh backend. It does not
decode speech locally.

1. `startListening()` in `src/background/index.ts` installs the microphone
   producer with `startAudio()`.
2. `session.mic.onAudioChunk(...)` supplies base64, 16 kHz, mono signed 16-bit
   PCM. `validAudioChunk()` validates the format, channel count, canonical base64,
   whole-sample shape, and 64 KiB frame ceiling. The fixed-window limiter caps
   forwarding at 100 frames per second.
3. The background sends each accepted frame over the single active WebSocket
   as `{"t":"a","d":"<base64 PCM>"}`. `sendInit()` selects exactly one BYOK
   field (`groqApiKey` or `openaiApiKey`) from the chosen provider before
   `start` is sent.
4. The shared backend performs transcription and emits a `match_progress`
   message. `renderProgress()` reads its `whisperText`, stores it as
   `match.heard`, retains at most three candidate matches, and calls
   `pushStatus()`.
5. `pushStatus()` transports a complete snapshot through
   `session.ui.send('status', ...)`. The tile listener
   `m.on('status', ...)` in `src/ui/index.html` calls `showSearch()` only while
   `s.listening` is true. `showSearch()` writes `s.heard` to the `sHeard`
   element with `textContent`, so decoded text is rendered as text, never HTML.

`match_progress.whisperText` is the live/interim decoded phrase. A final ayah
lock arrives separately as a `state` message whose mode is `LOCKED`, `PAUSED`,
or `RESUMING`. `renderState()` then stores the ayah snapshot, clears `match`,
and renders the locked verse. Stopping, socket closure, or configuration
re-initialization also clears `match`; the UI hides the search card whenever
listening is false or no match snapshot exists. Starting displays the generic
searching state until the next progress event. No decoded-text state is global:
all of it lives inside the per-`registerMiniapp` session closure.
