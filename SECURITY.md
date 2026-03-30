## Key / secret safekeeping (PERN)

### Rules
- **Never put secrets in `frontend/.env`**. Anything prefixed with `VITE_` is bundled into the browser and is public.
- Store secrets in **`backend/.env`** only, and keep it out of git (already ignored by `backend/.gitignore`).
- Prefer calling third‑party APIs (TMDB, Gemini) **from the backend** and expose only the data your UI needs.

### What this project uses
- **TMDB**: set `TMDB_TOKEN` in `backend/.env` (the app calls TMDB via `GET /api/tmdb/...`).
- **Gemini**: set `GOOGLE_GENAI_API_KEY` (and optionally `GEMINI_MODEL`) in `backend/.env`.
- **Email**: set `EMAIL_USER` + `EMAIL_PASS` (Gmail App Password). Optional: `EMAIL_FROM`.

### Recommended workflow
1. Copy `backend/.env.example` → `backend/.env` and fill values.
2. Copy `frontend/.env.example` → `frontend/.env` (only `VITE_API_URL`).
3. If a secret was ever committed or shared, **rotate it** immediately.

### Production note
For real deployments, use a secrets manager / environment variables in your host (Render/Heroku/Fly/Vercel/etc.) instead of shipping `.env` files.

### Server logging
- Use **`safeError` / `safeInfo` / `sanitizeForLog`** from `backend/utils/rotation.js` instead of raw `console.log` / `console.error` whenever a value might include **email, password, tokens, API keys, or database URLs**.
- This does not encrypt data at rest; it only reduces accidental secret leakage in logs.

