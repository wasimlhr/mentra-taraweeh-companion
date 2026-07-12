# Taraweeh Companion — MentraOS

Self-contained Mentra app: Quran recitation recognition on **G1/G2** glasses via MentraOS.

Everything lives in this folder — Mentra server (`src/`) + Quran pipeline (`backend/`).

---

## Publishing (G1 + G2)

One Mentra app covers **both G1 and G2**. Full guide:

→ **[PUBLISH.md](./PUBLISH.md)** (dev install → Railway → Mentra Store)

## Steps 1–5 (quick start)

### Step 1 — Register on console.mentra.glass

1. Go to [console.mentra.glass](https://console.mentra.glass) → **Create App**
2. **Package name:** e.g. `com.wasimlhr.taraweeh` (must match `.env` below)
3. **Public URL:** your ngrok HTTPS URL (set in step 4)
4. Copy the **API key**

### Step 2 — Permissions + settings

1. **Permissions** → add **MICROPHONE**
2. **Configuration Management** → **Import app_config.json**
3. Select: `D:\G2_DEV\mentra-taraweeh-companion\app_config.json`

### Step 3 — Configure `.env`

```powershell
cd D:\G2_DEV\mentra-taraweeh-companion
copy .env.example .env
```

Edit `.env`:

```env
PACKAGE_NAME=com.wasimlhr.taraweeh
MENTRAOS_API_KEY=paste_key_from_console
SHARED_GROQ_KEY=gsk_your_groq_key
SHARED_OPENAI_KEY=sk_your_openai_key
```

### Step 4 — Install, run, expose

```powershell
bun install
bun run dev
```

New terminal:

```powershell
ngrok http 3000
```

Paste the ngrok **HTTPS** URL into console.mentra.glass → your app → **Public URL**.

### Step 5 — Start on glasses

1. Open **Mentra** app on phone (G1 paired)
2. Install / start **Taraweeh Companion**
3. App **Settings** on phone: mode, surah hint, BYOK keys if needed
4. Start the app and recite — verses appear on glasses

---

## Verify it works

Server log when you start the app on phone:

```
[Mentra] Session ... user=you@email.com
[Mentra] Pipeline v4 (provider=groq, shared=true, surah hint=0)
```

## Phone app settings (after importing app_config.json)

| Setting | Purpose |
|---|---|
| Mode | Taraweeh vs Practice |
| Surah hint | 0 = auto, 1–114 = hint |
| Glasses bottom | Transliteration or translation |
| API key mode | Shared (server) vs BYOK (your key) |

## Touch controls (G1)

| Gesture | Action |
|---|---|
| Tap | Next page / advance ayah |
| Long press | Pause |

## Folder layout

```
mentra-taraweeh-companion/
├── app_config.json      ← import in console (step 2)
├── .env.example         ← copy to .env (step 3)
├── src/                 ← Mentra AppServer
├── backend/             ← Quran pipeline + data (bundled)
└── scripts/
```

## Troubleshooting

- **Port 3000 in use:** `bun run kill-port` then `bun run dev`
- **No mic / permission error:** add MICROPHONE in console, reinstall app
- **No transcription:** check `SHARED_GROQ_KEY` / `SHARED_OPENAI_KEY` in `.env`
- **Webhook not received:** Public URL must match ngrok; `PACKAGE_NAME` must match console

## Original G2 app

The Even Hub G2 version remains at `D:\G2_DEV\QuranLiveMeaning\taraweeh-companion`.
