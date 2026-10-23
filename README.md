# Adam AI Agent v2

Adam is a premium, bilingual personal AI workspace built for Web, Android, iOS, and desktop. v2 is a clean-room rebuild focused on a fast mobile experience, reliable AI transport, and architecture that can grow without a monolithic frontend.

## Local development

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/adamaf12/Adam_ai-agent.git
cd Adam_ai-agent
git checkout rebuild/adam-ai-v2
npm ci
cp .env.example .env
```

Edit `.env` and set `GEMINI_API_KEY` to your server-side Gemini API key.

```bash
npm run dev
```

Open `http://localhost:3000`. The development server runs Vite and the Node/Express API in the same process.

Check the local API:

```bash
curl http://localhost:3000/api/health
```

A healthy server reports `ok: true`; `configured` reports whether the server detected the provider key.

Optional server variables:

```env
GEMINI_API_KEY=...
ADAM_GEMINI_MODEL=gemini-3.8-flash
PORT=3000
```

Never commit `.env` or provider secrets. The browser and Android/iOS client must never embed `GEMINI_API_KEY`.

## Quality checks

```bash
npm test
npm run lint
npm run build
```

## Android

```bash
npm run build
npx cap sync android
npx cap open android
```

## Architecture

```text
React UI
  ↓
Feature controllers
  ↓
Domain + storage + AI client
  ↓
POST /api/chat (NDJSON stream)
  ↓
Server provider adapter
  ↓
Gemini
```

The browser never needs a provider API key. The server owns provider credentials and converts provider failures into stable application errors.

## Project direction

The next layers are intentionally added only after the foundation is stable: Tasks → Memory → Workspace integrations → Settings → agent routing/tools → web search → media → voice.

> v2 rebuild branch: every change is gated by automated tests, TypeScript, and a production build before it is considered ready.
