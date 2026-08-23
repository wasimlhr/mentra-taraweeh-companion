# Installing Taraweeh Companion on Mentra

One miniapp works on **G1 and G2** — you do not build two apps. The display is a
single full-canvas text element precisely so it renders correctly on both.

## This changed in Mentra 3.0

The old flow on this page — ngrok, a hosted 24/7 server, a Public URL, the
Mentra console, publishing to the Mentra Store — belonged to the cloud SDK and
**no longer applies**. Miniapps run on the phone. There is no server of ours to
host and no Public URL to register.

Mentra 3.0 also shipped **without the Miniapp Store**: only official Mentra
miniapps are preinstalled, and the store is due back later in 2026. So there is
currently no public publishing path for a third-party miniapp.

## Install it on your glasses (the only route today)

1. `bun install`
2. `bun run dev` — validates the manifest, builds both layers, serves over your
   LAN and prints a QR code.
3. In the Mentra app: **Settings → Miniapp Developer Settings → Scan Miniapp QR
   Code**.

Phone and computer must be on the same network.

`bun run release` does the same but validates, builds, packs and serves an
install QR for a release build. `bun run build` just produces the ZIP.

The CLI is **Bun-only** — it ships as TypeScript and runs under Bun, so use
`bun` / `bunx`, never `npx` or Node.

## What still needs hosting

Only the recognition backend, and it is already deployed — the same one the
Even Realities G2 build uses. The miniapp connects to it over WebSocket, so
nothing about installing the miniapp involves deploying anything.

If you point it elsewhere, change `BACKEND` in `src/background/index.ts`.

## Keys

Transcription keys come from miniapp settings (`provider`, `groqApiKey`,
`openaiApiKey`, `lang`). Each user brings their own — a shared pool hits rate
limits.
