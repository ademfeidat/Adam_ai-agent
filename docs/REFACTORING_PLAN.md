# Repository Organization and Refactoring Plan

## Goal

Make Adam AI Agent easy to debug, maintain and extend without destabilizing its web app, Android app, model engine, authentication, or existing NDJSON streaming contract.

## Guardrails

- Work on a dedicated branch; do not edit the production branch directly.
- Do not mass-rename or move files before import/dependency mapping.
- Keep the client, server, database and native Android boundaries explicit.
- Keep secrets server-side. Never copy secret values into docs, logs, examples or client bundles.
- Preserve existing API routes and NDJSON event shapes unless a separately tested migration explicitly changes them.
- Do not remove legacy code until repository-wide references and runtime use have been checked.
- Treat `android/` generated web assets and APKs as build outputs, not source-of-truth application code.

## Phases

### Phase 0 — Inventory and safety baseline
- [x] Map major directories and request paths in `PROJECT_MAP.md`.
- [ ] Identify tracked credentials, signing material, APKs, source maps and generated bundles.
- [ ] Establish a clean CI baseline on the refactor branch.
- [ ] Record current API contracts and environment variable names (names only, never values).

### Phase 1 — Separate composition from implementation
- [ ] Extract Express route groups from `server.ts` into `server/routes/` by domain: auth, chat, conversations, health/diagnostics, media and agent.
- [ ] Keep `server.ts` as middleware + route composition + server startup.
- [ ] Add typed request/response contracts for chat NDJSON and auth session endpoints.
- [ ] Add tests for auth-to-session exchange, chat streaming and persistence failure paths.

### Phase 2 — Client domain boundaries
- [ ] Keep feature screens in `src/features/`.
- [ ] Move feature-specific hooks and state out of large screen components into colocated hooks/services.
- [ ] Keep provider selection in `src/core/models/` and HTTP/stream transport in `src/core/ai/`.
- [ ] Remove duplicate model-routing logic only after behavior parity tests exist.

### Phase 3 — Provider adapters
- [ ] Define one provider interface and normalized error taxonomy.
- [ ] Keep Gemini, OpenRouter and Vercel AI Gateway adapters isolated.
- [ ] Add provider health/config diagnostics that reveal status and model names only, never keys.
- [ ] Test timeout, rate limit, invalid key, malformed response, empty output and fallback behavior.

### Phase 4 — Persistence and identity
- [ ] Make Google/Firebase ID-token exchange create the server's signed HttpOnly session.
- [ ] Make every protected API request use the server session, not client profile fields.
- [ ] Enforce per-user conversation/message ownership and test cross-account isolation.
- [ ] Preserve offline local storage as a fallback without silently claiming remote sync.

### Phase 5 — Native and generated artifacts
- [ ] Define a single source of truth for web assets and Android build outputs.
- [ ] Stop tracking generated APKs, minified bundles and source maps where they are not intentional release artifacts.
- [ ] Keep Android Java/Gradle/native configuration under `android/`.
- [ ] Keep Capacitor sync/build reproducible through CI.

### Phase 6 — Documentation and maintenance
- [ ] Add architecture decision records for auth, model routing and persistence.
- [ ] Add a troubleshooting guide mapping user-visible errors to logs/routes/tests.
- [ ] Add CODEOWNERS or domain ownership guidance if maintainers expand.
- [ ] Keep this plan updated as each phase is completed.

## Definition of done

A refactor phase is complete only when:
1. TypeScript/lint passes.
2. Unit and integration tests pass.
3. Web production build passes.
4. Android debug build passes when native-facing code changes.
5. No public API or NDJSON contract regresses.
6. The changed files and new ownership boundaries are documented.
