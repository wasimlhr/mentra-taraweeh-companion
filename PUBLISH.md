# Installing Taraweeh Companion on Mentra

One miniapp works on **G1 and G2** — you do not build two apps. The display is a
single full-canvas text element precisely so it renders correctly on both.

## This changed in Mentra 3.0

The old flow on this page — ngrok, a hosted 24/7 server, a Public URL, the
Mentra console, publishing to the Mentra Store — belonged to the cloud SDK and
**no longer applies**. Miniapps run on the phone. There is no server of ours to
host and no Public URL to register.

## The three official install routes (docs.mentraglass.com → Distribution)

1. **`bun run dev`** — hot-reload development. **Not an installation**: the
   docs are explicit that the computer and CLI must keep running to serve the
   runtime bundle. Scan the QR from **Settings → Developer settings → Scan
   Mini App QR Code**; phone and computer on the same network.
2. **`bun run release`** — the persistent install. Packs a release build and
   serves a `miniapp://release` QR on port 6789; after one scan **the miniapp
   installs on the phone, runs offline, and survives restarts — no laptop
   needed again** until you want to ship a new version (bump `version` in
   `miniapp.json`, re-run, re-scan).
3. **`bun run pack:win`** — produces `build/<pkg>-<version>.zip` for
   submission through the Mentra **Developer Console** (the public store
   path).

On Windows with a *Public* Wi-Fi profile, allow the serving ports through the
firewall first (dev uses 3002-3003, release uses 6789), or install over
Tailscale.

The CLI is **Bun-only** — it ships as TypeScript and runs under Bun, so use
`bun` / `bunx`, never `npx` or Node.

**Windows CLI quirks (re-apply both patches after any `bun install`, until
fixed upstream):**

- The CLI's file watcher compares paths with forward slashes, but Windows
  reports backslashes, so edits under `src/background/` broadcast a UI-only
  `reload` instead of `respawn-bg` (and `node_modules` churn is not
  filtered). Patch `node_modules/@mentra/miniapp-cli/src/dev-server.ts`:
  normalize the watcher's `filename` with `.replace(/\\/g, "/")` before the
  comparisons.
- The CLI's `pack` (used by `release` too) spawns a system `zip` binary that
  Windows does not ship. Patch `node_modules/@mentra/miniapp-cli/src/pack.ts`
  to zip in-process with JSZip (the CLI already depends on it — dev-server
  builds its bundle.zip with it). `scripts/pack-win.ts` remains the
  patch-free fallback for producing the store ZIP.

## What still needs hosting

Only the recognition backend, and it is already deployed — the same one the
Even Realities G2 build uses. The miniapp connects to it over WebSocket, so
nothing about installing the miniapp involves deploying anything.

If you point it elsewhere, change `BACKEND` in `src/background/index.ts`.

## Keys

Transcription keys come from miniapp settings (`provider`, `groqApiKey`,
`openaiApiKey`, `lang`). Each user brings their own — a shared pool hits rate
limits.
