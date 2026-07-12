# Publish Taraweeh Companion on Mentra (G1 + G2)

One Mentra app works on **both G1 and G2**. You do not build two apps.

There are **two different goals**. Do them in order.

| Goal | What you need | Result |
|------|----------------|--------|
| **A. Dev / private install** | PC + ngrok + Mentra console | You (and friends with share link) can run it |
| **B. Public store publish** | Hosted 24/7 server (Railway/Render) + Mentra publish | Anyone finds it in Mentra Store |

ngrok alone is fine for A. For B, Mentra needs a **permanent Public URL** (not a changing free ngrok URL).

---

## Before anything — fix what broke

Your folder is ready at `D:\G2_DEV\mentra-taraweeh-companion`, but:

1. **No `.env` yet** → create it (below)
2. **ngrok was not installed** → that is why `ngrok http 3000` failed

### Install ngrok (Windows)

```powershell
winget install Ngrok.Ngrok
```

Then restart the terminal, sign up at [ngrok.com](https://ngrok.com), and run:

```powershell
ngrok config add-authtoken YOUR_TOKEN_FROM_NGROK_DASHBOARD
```

Optional but strongly recommended: in ngrok dashboard → **Domains** → create a **static domain**, then always use:

```powershell
ngrok http --url=YOUR_STATIC_DOMAIN.ngrok-free.app 3000
```

### Create `.env`

```powershell
cd D:\G2_DEV\mentra-taraweeh-companion
copy .env.example .env
notepad .env
```

Fill:

```env
PORT=3000
PACKAGE_NAME=com.wasimlhr.taraweeh
MENTRAOS_API_KEY=paste_from_console_after_step_1
SHARED_GROQ_KEY=gsk_...
SHARED_OPENAI_KEY=sk-...
```

Use the same Groq/OpenAI keys as your G2 Taraweeh backend if you already have them.

---

## Goal A — Get it running on your G1/G2 (must do first)

### 1. Create app in Mentra Console

1. Open [console.mentra.glass](https://console.mentra.glass) — **same account** as Mentra phone app
2. **Create App**
3. Name: `Taraweeh Companion`
4. Package: `com.wasimlhr.taraweeh` (must match `.env`)
5. Public URL: leave blank for now, or put your static ngrok URL if you already have it
6. Copy **API key** → put in `.env` as `MENTRAOS_API_KEY`

### 2. Permissions + settings

1. Open your app in console
2. **Permissions** → add **MICROPHONE**
3. **Configuration / Import app_config.json** → choose:

   `D:\G2_DEV\mentra-taraweeh-companion\app_config.json`

### 3. Run server + tunnel (two terminals)

**Terminal 1:**

```powershell
cd D:\G2_DEV\mentra-taraweeh-companion
bun install
bun run dev
```

You want: `App server running at http://localhost:3000`

**Terminal 2:**

```powershell
ngrok http 3000
```

Or with static domain:

```powershell
ngrok http --url=YOUR_STATIC_DOMAIN.ngrok-free.app 3000
```

Copy the **https://…** Forwarding URL.

### 4. Paste Public URL in console

Console → your app → **Public URL** = that https URL (no trailing slash). Save.

### 5. Phone + glasses

1. Install Mentra from [mentra.glass/install](https://mentra.glass/install)
2. Disconnect glasses from Even app if needed, connect to Mentra (G1 or G2)
3. In Mentra, find **Taraweeh Companion** (dev apps / My Apps)
4. Or use **Share** install link from console → open on phone
5. Start the app, recite

**Success check:** Terminal 1 shows something like:

```text
[Mentra] Session ... user=you@email.com
[Mentra] Pipeline v4 ...
```

If that line never appears, Public URL / package name / API key is wrong.

### G1 / G2 controls (this Mentra port)

| Gesture | Action |
|---------|--------|
| Tap | Next page (long ayah) or advance ayah |
| Long press | Pause recognition |

---

## Goal B — Publish to Mentra Store (public)

Do this only after Goal A works on your own glasses.

### 1. Host the server permanently

ngrok on your PC is **not** good enough for store users.

Deploy `mentra-taraweeh-companion` to Railway / Render / Fly:

1. Push this folder to a GitHub repo (or deploy from local)
2. Set env vars on the host:

   - `PACKAGE_NAME`
   - `MENTRAOS_API_KEY`
   - `SHARED_GROQ_KEY`
   - `SHARED_OPENAI_KEY`
   - `PORT` (host often sets this; Mentra SDK usually reads `PORT`)

3. Get the permanent HTTPS URL, e.g. `https://taraweeh-mentra.up.railway.app`
4. In console.mentra.glass → set **Public URL** to that permanent URL

### 2. Polish store listing in console

In [console.mentra.glass](https://console.mentra.glass) edit the app:

- Nice name + description
- Logo / icon
- MICROPHONE permission still present
- `app_config.json` settings imported
- Public URL = production host

### 3. Publish

**Option A — Console UI**

Open your app → look for **Submit / Publish / Store status** and submit for review (or publish if your org allows it).

**Option B — Mentra CLI**

```powershell
npm install -g @mentra/cli
```

In console → **Settings → CLI Keys** → generate token, then:

```powershell
$env:MENTRA_CLI_TOKEN="paste_cli_token_here"
mentra app list
mentra app publish com.wasimlhr.taraweeh
```

If it asks for confirmation and you are sure:

```powershell
mentra app publish com.wasimlhr.taraweeh --force
```

### 4. After publish

- App appears in Mentra Store for G1 and G2 users on MentraOS
- Keep production server running 24/7
- Keep shared Whisper keys funded (or push users to BYOK in settings)

---

## Common failures

| Symptom | Fix |
|---------|-----|
| `ngrok` not recognized | `winget install Ngrok.Ngrok`, new terminal, add authtoken |
| Port 3000 in use | `bun run kill-port` then `bun run dev` |
| No session logs | Public URL wrong / Mentra not hitting your server |
| Permission / mic errors | Add MICROPHONE in console, reinstall app on phone |
| Transcription fails | Fill `SHARED_GROQ_KEY` / `SHARED_OPENAI_KEY` |
| Store publish rejected / fails | Need permanent Public URL, not laptop ngrok |

---

## What to do right now (checklist)

1. [ ] Install ngrok + authtoken  
2. [ ] Create `.env` with package name + Groq/OpenAI keys  
3. [ ] Create app on console.mentra.glass + copy API key into `.env`  
4. [ ] Import `app_config.json` + add Microphone  
5. [ ] `bun run dev` + `ngrok http 3000`  
6. [ ] Paste Public URL in console  
7. [ ] Start app from Mentra phone with G1 or G2  
8. [ ] When solid: deploy to Railway, then `mentra app publish …`
