# Taraweeh Companion — MentraOS

Follows live Quran recitation and shows the current ayah, with translation, on
MentraOS smart glasses.

## What this is

A **thin miniapp**. All recognition — the 6,236-ayah corpus, the IDF-weighted
matcher, the anchor state machine, the reading-pace timer — runs in the
Taraweeh Companion backend, which is shared with the Even Realities G2 build:

    glasses mic ──► miniapp background ──WebSocket──► backend ──► Whisper (Groq / OpenAI)
                          ▲                              │
                          └────── ayah + translation ◄────┘

Nothing is vendored. A matcher fix deploys once and reaches both platforms.

> The previous version of this app was a cloud server on `@mentra/sdk` that
> carried its own copy of the engine. That copy drifted about 60 commits behind
> and was missing every recognition fix since v2.6.7 — including the one that
> stopped Bismillah locking onto Al-Fatiha. MentraOS has since replaced
> `@mentra/sdk` with the on-device `@mentra/miniapp` SDK, so the app was
> rewritten rather than patched.

## Layout

    miniapp.json            manifest — package id, permissions, entry points
    src/background/index.ts the whole client (~250 lines)

The background layer is **not Node and not a browser** — it is a bare JS engine
(JavaScriptCore on iOS, QuickJS on Android). Only `fetch`, the native WebSocket
bridge, timers and the session API exist. No `Buffer`, no DOM, no Node built-ins.

## Audio

`session.mic.onAudioChunk` delivers **base64-encoded PCM**, which is forwarded
verbatim to the backend as `{"t":"a","d":"<base64>"}`. No decoding happens
on-device, which is what keeps this viable in a bare JS engine.

The host can also hand back **LC3** instead of PCM depending on the phone's mic
mode. There is no LC3 decoder here, so that case is detected and reported on the
glasses rather than being forwarded as noise.

## Controls

| Gesture | Action |
|---|---|
| Single tap | Start / stop listening |
| Swipe up | Previous ayah |
| Swipe down | Next ayah |
| Long press | Stop |

## Configuration

The backend is set by `BACKEND` in `src/background/index.ts`. It points at the
shared deployment by default.

Transcription keys are read from miniapp settings (`provider`, `groqApiKey`,
`openaiApiKey`, `lang`). Each user brings their own key — a shared pool hits
rate limits.

## Develop

    bun install
    bun run dev

The CLI is **Bun-only** — it ships as TypeScript and runs under Bun, so use
`bun` / `bunx`, not `npx` or Node. `bun run release` validates, builds, packs
and serves an install QR; `bun run build` just produces the ZIP.

Then scan the QR code: **Settings → Miniapp Developer Settings → Scan Miniapp
QR Code** in the Mentra app.

## Distribution

Mentra 3.0 shipped without the Miniapp Store — only official Mentra miniapps
are preinstalled, and the store is due back later in 2026. Until then this is
installed by dev QR: run the dev server, then Settings > Miniapp Developer
Settings > Scan Miniapp QR Code in the Mentra app.

## Status

The rewrite has **not been run on hardware yet**. The backend transport was
verified end to end (base64 PCM decoded correctly, reached Whisper, matched),
but the MentraOS SDK surface — display, mic, input — is written against the
current docs and needs a device to confirm. `@mentra/miniapp` is at sdkVersion
0.3.0 and still moving.
