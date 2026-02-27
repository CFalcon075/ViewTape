# AGENTS.md

## Cursor Cloud specific instructions

**ViewTape** is a self-hosted, 2007-era YouTube-style video sharing website. It is a single Node.js/Express application with an embedded SQLite database (via `sql.js` WASM — no external DB process).

### Running the application

- Start: `node server.js` (or `npm start` / `npm run dev` — all equivalent)
- Runs on port 3000 by default (configurable via `PORT` env var)
- The SQLite database is auto-created on first run at `db/viewtape.db`
- `ffmpeg` is used for auto-thumbnail generation from uploads; without it thumbnails must be uploaded manually

### Key caveats

- There are no lint scripts, no test scripts, and no build step in `package.json`. The app serves raw JS/EJS directly.
- `start.sh` is an interactive startup script (prompts for port/password/2FA) — use `node server.js` directly for non-interactive startup.
- The `.env.example` file documents optional env vars (`PORT`, `SESSION_SECRET`). No `.env` file is required for development; defaults work out of the box.
- Upload directories (`uploads/videos`, `uploads/thumbnails`, `uploads/avatars`, `uploads/banners`) are auto-created by `server.js` on startup.

### Standard commands

See `README.md` for full setup/run instructions. Quick reference:

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Start server | `node server.js` |
| Access app | `http://localhost:3000` |
