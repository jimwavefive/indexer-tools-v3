# Claude Code Project Context

## Project
Fork of [vincenttaglia/indexer-tools-v3](https://github.com/vincenttaglia/indexer-tools-v3) — a Vue 3 + Vuetify dashboard for managing The Graph indexer allocations, restructured as a pnpm monorepo with a Node.js backend.

## Git Remotes
- `origin` — our fork: `https://github.com/jimwavefive/indexer-tools-v3.git`
- Forked from [vincenttaglia/indexer-tools-v3](https://github.com/vincenttaglia/indexer-tools-v3)

All pushes go to `origin` (our fork). No upstream remote configured.

## Development Rules
- **Plan before implementing**: For debugging sessions and multi-file changes, outline a numbered plan before writing any code. Include which files you'll touch, the likely root cause (for bugs), and what could go wrong. Wait for approval before implementing.
- **Commit incrementally during debugging**: When fixing multiple issues in a session, commit each verified fix individually before moving to the next issue. Don't accumulate changes across unrelated fixes — it makes regressions harder to isolate.
- **Conservative parameters**: When working with Docker networking, RPC calls, or blockchain operations, use conservative defaults (small batch sizes, short timeouts, 1-block rewinds). Never propose large-scale operations without explicit user approval.

## Dev Workflow
- Build & run: `docker compose up --build -d`
- App runs at: `http://localhost:3000`
- Environment config: `.env` (gitignored) — copy from `.env.example` and fill in secrets
- Reference compose file: `docker-compose.example.yml` (committed) → copy to `docker-compose.yml` (gitignored)
- Production env vars: copy from the prod env file to `.env` when needed
- **IMPORTANT**: This is a developer's Linux desktop — never install npm packages, node modules, or run `npm install`/`yarn install` on the host. All building, testing, and dependency management must happen inside Docker containers.

## Monorepo Structure
```
packages/
  frontend/   — Vue 3 SPA + Express static server with /api proxy
  backend/    — Node.js/Express API (notifications, AI agent)
  shared/     — Shared TypeScript types, GraphQL queries, math utils
```
- Package manager: pnpm with `pnpm-workspace.yaml`
- Build: multi-stage Dockerfile with `frontend-prod` and `backend-prod` targets
- The frontend server.js proxies `/api/*` to the backend over the Docker network — backend port 4000 is NOT exposed to the host

## Key Architecture
- **Framework**: Vue 3 with Composition API (`<script setup>`), Pinia stores, Vuetify 3
- **Math**: BigNumber.js for all financial calculations (Wei/GRT conversions)
- **Web3 utils**: Lightweight `packages/frontend/src/plugins/web3Utils.js` (toWei/fromWei/toBN) — Web3.js was removed
- **Build**: Vite (frontend), tsup (backend/shared), multi-stage Dockerfile with Node 20
- **Feature flags**: `VITE_FEATURE_NOTIFICATIONS` and `VITE_FEATURE_AGENT` — build-time flags via Vite, controlled in `.env`
- **Runtime config**: `docker-entrypoint.sh` writes `indexer-tools-config.json` from env vars at container start

## Important Files — Frontend (`packages/frontend/`)
- `server.js` — Express static server with `/api` reverse proxy to backend
- `docker-entrypoint.sh` — Writes runtime config JSON from env vars before starting server
- `src/plugins/commonCalcs.js` — APR, maxAllo, daily rewards, auto target APR calculations
- `src/plugins/defaultsConfig.js` — Loads config from JSON file, env vars, and hardcoded defaults
- `src/store/newAllocationSetter.js` — allocation wizard state, opening/closing stake, available stake
- `src/store/subgraphs.js` — subgraph data fetching and filtering (getFilteredSubgraphs)
- `src/store/subgraphSettings.js` — filter settings with localStorage persistence
- `src/store/featureFlags.js` — runtime feature flag store
- `src/store/agent.js` — AI agent chat store (uses `/api/agent/*`)
- `src/store/notificationRules.js` — notification rules/channels/history store (uses `/api/notifications/*`)
- `src/store/chainValidation.js` — RPC chain validation with dRPC fallback
- `src/views/SubgraphsDashboard.vue` — main subgraph list with filters, auto APR toggle
- `src/views/AllocationWizard.vue` — 5-step wizard: close allocations, POIs, pick subgraphs, set allocations, execute
- `src/views/NotificationSettings.vue` — rules, channels, and history management
- `src/views/AgentDashboard.vue` — AI agent chat interface

## Important Files — Backend (`packages/backend/`)
- `src/index.ts` — Express app entry point, mounts routes, starts notification poller
- `src/api/routes/notifications.ts` — CRUD for rules, channels, history
- `src/api/routes/agent.ts` — AI chat endpoint with tool use
- `src/api/routes/health.ts` — Health check endpoint
- `src/services/notifications/` — Notification engine, rules, and Discord channel
- `src/services/poller/` — Network data polling scheduler
- `src/agent/` — AI provider abstraction (Claude, OpenAI, Ollama) with indexer tools
- `src/db/jsonStore.ts` — Simple JSON file-based persistence

## Config Files
- `.env.example` — comprehensive documented env file (committed, reference)
- `docker-compose.example.yml` — reference compose file (committed)
- `.env` — local env with secrets (gitignored)
- `docker-compose.yml` — local compose file (gitignored)

## Security Notes
- Never commit `vite.config.js` changes with internal hostnames (e.g. `*.wavefive.services`)
- The `.env` file contains local config — already gitignored
- `docker-compose.yml` is gitignored — only `docker-compose.example.yml` is committed
- Hardcoded default API keys in `src/plugins/defaultsConfig.js` are upstream defaults, not personal
- Backend port 4000 is internal to Docker network only — not exposed to host
