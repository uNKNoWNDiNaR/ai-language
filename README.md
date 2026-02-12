# AI Language Tutor

A calm, conversational language tutoring app with a React/Vite frontend and an Express/MongoDB backend.

## Repo Layout
- `frontend/` Vite + React client
- `backend/` Express API + MongoDB
- `docs/` migration notes and dev docs

## Requirements
- Node.js 22.x (backend uses this in `package.json` engines)
- npm

## Quick Start

Backend:
```bash
cd backend
npm ci
npm run build
npm run start
```

Frontend:
```bash
cd frontend
npm ci
npm run dev
```

Default ports:
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173`

## Production URL
- Backend (Render): `https://ai-language-tutor-2ff9.onrender.com`

## Environment Variables

Backend (in `backend/.env`):
- `MONGO_URI` (or `MONGO_URL` / `MONGODB_URI`) required for MongoDB
- `OPENAI_API_KEY` required for tutor responses
- `AUTH_TOKEN` optional; if set, requests must include `Authorization: Bearer <token>`
- `PORT` optional (defaults to `3000`)
- `JSON_BODY_LIMIT`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` optional tuning
- `PRACTICE_GEN_ENABLED`, `FEATURE_INSTRUCTION_LANGUAGE` optional feature flags

Frontend (in `frontend/.env`):
- `VITE_API_BASE` (defaults to `http://localhost:3000`).
  - Production: `https://ai-language-tutor-2ff9.onrender.com`
- `VITE_AUTH_TOKEN` optional; must match backend `AUTH_TOKEN` if enabled
- `VITE_FEATURE_INSTRUCTION_LANGUAGE` optional flag

## Common Scripts

Frontend:
- `npm run dev` — start Vite dev server
- `npm run build` — production build
- `npm run test` — run unit tests

Backend:
- `npm run build` — compile TypeScript
- `npm run start` — run compiled server
- `npm run test` — run tests
- `npm run check:lessons` — generate + validate lessons

## Tailwind v4 Note

This project uses Tailwind v4. Use the v4 format in `frontend/src/styles.css`:
```css
@import "tailwindcss";
```
Avoid the old `@tailwind base/components/utilities` directives, which are v3-style and will cause missing utilities.
