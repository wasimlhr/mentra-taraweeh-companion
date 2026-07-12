# Deploy on Railway

1. Push this repo to GitHub (done via `gh`).
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → select `mentra-taraweeh-companion`.
3. Add variables:

```
PACKAGE_NAME=com.wasimlhr.taraweeh
MENTRAOS_API_KEY=...
SHARED_GROQ_KEY=...
SHARED_OPENAI_KEY=...
```

(`PORT` is set by Railway automatically.)

4. After deploy, copy the public HTTPS URL (e.g. `https://mentra-taraweeh-companion-production.up.railway.app`).
5. Paste that into Mentra Console → **Server URL** (no path, no trailing slash).

Generate a domain: Railway service → **Settings** → **Networking** → **Generate Domain**.
