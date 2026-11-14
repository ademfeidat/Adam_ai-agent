# Adam AI Agent — Project Map

This document describes the current repository layout. It is intentionally based on the existing code paths; it does not claim that every listed subsystem is fully operational.

## Top-level layout

| Path | Responsibility |
|---|---|
| `src/` | React + TypeScript client application |
| `src/components/` | Shared UI components and application shell |
| `src/features/` | User-facing feature areas (chat, auth, media, memory, settings, integrations, etc.) |
| `src/core/` | Client-side domain logic, auth state, model routing, storage, agent orchestration and utilities |
| `server.ts` | Express application composition, middleware and HTTP route registration |
| `server/` | Server-side capabilities grouped by domain |
| `server/security/` | Authentication/session, permissions, secrets, rate limits, audit, approvals and safety controls |
| `server/features/` | Server feature routes and bridges (multimodal, live) |
| `server/agent.ts` | Agent route and request execution entry point |
| `server/aiGateway.ts`, `server/openRouterProvider.ts` | Provider adapters for model gateway and OpenRouter |
| `server/supabase.ts`, `server/supabaseConversations.ts` | Server-only Supabase client and conversation persistence |
| `api/` | Vercel serverless entry point |
| `supabase/migrations/` | Ordered database schema migrations |
| `tests/` | Automated tests (Node test runner / project test scripts) |
| `docs/` | Architecture, operations, decisions and maintenance documentation |
| `.github/workflows/` | CI, web preview and Android build workflows |
| `android/` | Capacitor-generated/native Android project; treat generated assets separately from source |
| `public/` | Static web assets copied into the web build |
| `electron/` | Desktop shell |
| `lib/` | Legacy or cross-platform service code; verify consumers before moving |
| `assets/`, `bin/` | Supporting assets and bundled utilities |

## Request paths

### Authentication
1. Client auth state and Google/Firebase integration: `src/core/auth/`.
2. Shared login UI: `src/components/AuthModal.tsx`, `src/components/GoogleAuthButton.tsx`, and `src/features/auth/`.
3. Server identity verification and signed session middleware: `server/security/` and the auth routes in `server.ts`.
4. Keep identity proof on the server. A cached client profile is display state, not authentication.

### Chat and model execution
1. Chat UI and conversation lifecycle: `src/features/chat/`.
2. Client request/stream parsing: `src/core/ai/`.
3. Model selection and routing: `src/core/models/` and `src/core/swarm/`.
4. Server request handling and NDJSON response stream: `server.ts`, with provider adapters under `server/`.
5. Preserve the NDJSON wire contract when changing providers or refactoring routes.

### Persistence
1. Client storage adapters: `src/core/storage.ts`, `src/core/storage/`, `src/core/supabase.ts`.
2. Server-only Supabase access: `server/supabase.ts`, `server/supabaseConversations.ts`.
3. Database changes: new timestamped SQL files in `supabase/migrations/`.
4. Enforce ownership on the server; never expose service-role/secret keys to the browser.

## Placement rules for new code

- UI reusable across features belongs in `src/components/`; feature-specific UI belongs beside its feature in `src/features/<feature>/`.
- Client business logic belongs in `src/core/<domain>/`, not in large React components.
- HTTP route handlers and server integrations belong in `server/<domain>/`; `server.ts` should compose routes rather than become a dumping ground.
- Database migrations belong only in `supabase/migrations/`.
- Tests should mirror the domain under test and use descriptive names.
- Operational and architectural decisions belong in `docs/`.
- Never commit credentials, signing keys, local environment files, generated build output, APKs, source maps, or dependency directories.

## Important boundary

The repository currently contains overlapping/legacy subsystems and generated Android/web artifacts. Do not mass-move files in one commit. Refactor one domain at a time, preserve public imports and API contracts, and run lint, tests, web build, and Android build after each migration.
