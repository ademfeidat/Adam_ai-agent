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

Edit `.env` and configure at least one server-side AI provider. For the independent, multi-model provider, set `OPENROUTER_API_KEY`; the existing Gemini provider remains available as a fallback.

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
# Independent provider (recommended for the main chat/agent)
OPENROUTER_API_KEY=...
ADAM_OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
# Optional model-level fallbacks, comma-separated
ADAM_OPENROUTER_FALLBACK_MODELS=google/gemini-3.8-flash

# Existing provider / fallback
GEMINI_API_KEY=...
ADAM_GEMINI_MODEL=gemini-3.8-flash
PORT=3000
```

OpenRouter is isolated in `server/openRouterProvider.ts`. It uses a server-side key, configurable model routing, optional model-level fallbacks, provider-side failover, and tool-enabled streaming for the main chat. If `OPENROUTER_API_KEY` is set, it takes priority for the main chat and is prioritized in agent runs; Gemini remains available for Gemini-specific features and as a fallback. OpenRouter usage may incur charges according to the selected model and account credits.

Media generation is routed separately from chat: `GEMINI_API_KEY` with Veo access powers real asynchronous video generation (the API returns an operation ID, the Studio polls its status, and the download endpoint streams the finished MP4). Image generation tries native Gemini image models, then configured Hugging Face FLUX, then the public Pollinations image endpoint. OpenRouter is a chat/agent provider; an OpenRouter key alone does not enable Veo video generation. The app intentionally does not substitute a still image and label it as a video.

Never commit `.env` or provider secrets. The browser and Android/iOS client must never embed `OPENROUTER_API_KEY` or `GEMINI_API_KEY`.

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
Server-only provider router
  ├─ OpenRouter (independent, configurable model chain)
  ├─ Vercel AI Gateway (optional)
  └─ Gemini direct API (fallback / Gemini-specific features)
```

The browser never needs a provider API key. The server owns provider credentials and converts provider failures into stable application errors.

## Project direction

The next layers are intentionally added only after the foundation is stable: Tasks → Memory → Workspace integrations → Settings → agent routing/tools → web search → media → voice.

> v2 rebuild branch: every change is gated by automated tests, TypeScript, and a production build before it is considered ready.
