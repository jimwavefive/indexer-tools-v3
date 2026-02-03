# Indexer Tools v3

## About

Indexer Tools is a dashboard for indexers on [The Graph](https://thegraph.com/) decentralized network. It provides tools for viewing allocations, filtering subgraphs, calculating allocation effectiveness, and managing indexer operations.

Built with Vue 3 (Composition API), Vuetify 3, Pinia, and a Node.js backend — structured as a pnpm monorepo.

## Features

**Subgraphs Dashboard** — Browse and filter all subgraphs by signal, network, rewards status, deployment status, and more. An **Auto Target APR** mode calculates the optimal target APR to fully allocate your available stake, iteratively excluding overstaked subgraphs. A **Hide 0% APR** filter removes zero-yield subgraphs from the list.

**Allocations Dashboard** — View current allocations with APR, daily rewards, pending rewards, and QoS metrics. Filter by minimum epoch duration. Export to CSV.

**Allocation Wizard** — Step-by-step workflow to close existing allocations, select new subgraphs, set allocation amounts, and execute on-chain.

**Blacklist & Synclist** — Filter subgraphs via manual entries in the UI, or load a blacklist from a file (see [Blacklist File](#blacklist-file)). Both sources are merged when filtering is enabled.

**Chain Validation RPCs** — Configure per-chain RPC endpoints for block hash verification instead of using the default DRPC provider. Configurable in the UI (Settings > Chain Validation RPCs) or via the `CHAIN_VALIDATION_RPCS` environment variable.

**Notifications** *(optional)* — Backend-powered notification rules that monitor allocation duration, signal drops, disproportionate allocations, and subgraph upgrades. Alerts are delivered via Discord webhooks. Enable with `VITE_FEATURE_NOTIFICATIONS=true` and `FEATURE_NOTIFICATIONS_ENABLED=true`.

**AI Agent** *(optional)* — Chat interface backed by Claude, OpenAI, or Ollama with indexer-specific tools (analyze allocations, query network data, propose rebalances). Enable with `VITE_FEATURE_AGENT=true` and `FEATURE_AGENT_ENABLED=true`.

**Auto-Refresh** — Configurable dashboard refresh interval (Settings > General): Off, 1 min, 2 min, 5 min, or 10 min.

## Architecture

```
packages/
  frontend/   — Vue 3 SPA served by Express, with /api reverse proxy
  backend/    — Node.js/Express API for notifications and AI agent
  shared/     — Shared TypeScript types, GraphQL queries, math utils
```

The frontend Express server proxies all `/api/*` requests to the backend container over the Docker network. The backend is not exposed to the host — only port 3000 (frontend) is published.

# Deployment

## Quick Start

```bash
# 1. Copy example files
cp .env.example .env
cp docker-compose.example.yml docker-compose.yml

# 2. Edit .env — at minimum set your Graph API key
#    See .env.example for all available options with documentation

# 3. Build and run
docker compose up --build -d
```

The app will be available at `http://localhost:3000`.

## Requirements
* Docker and Docker Compose
* Graph Protocol API Key — get one at https://thegraph.com/studio/apikeys/

## Environment Variables

All environment variables are documented in [`.env.example`](./.env.example) with descriptions and defaults. Key groups:

| Group | Variables | Type |
|---|---|---|
| Graph API | `VITE_GRAPH_API_KEY`, `GRAPH_API_KEY` | Build-time / Runtime |
| Default Accounts | `DEFAULT_ACCOUNTS` | Runtime |
| RPC Endpoints | `DEFAULT_RPC_MAINNET`, `DEFAULT_RPC_ARBITRUM`, etc. | Runtime |
| Network Subgraphs | `DEFAULT_SUBGRAPH_MAINNET`, `DEFAULT_SUBGRAPH_ARBITRUM`, etc. | Runtime |
| QoS Subgraph | `DEFAULT_QOS_SUBGRAPH` | Runtime |
| Chain Validation | `CHAIN_VALIDATION_RPCS` | Runtime |
| Feature Flags | `VITE_FEATURE_NOTIFICATIONS`, `VITE_FEATURE_AGENT` | Build-time |
| Backend: Notifications | `FEATURE_NOTIFICATIONS_ENABLED`, `INDEXER_ADDRESS`, `POLLING_INTERVAL_SECONDS`, `NETWORK_SUBGRAPH_URL` | Runtime |
| Backend: AI Agent | `FEATURE_AGENT_ENABLED`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL` | Runtime |

**Build-time** variables (`VITE_*`) are baked into the frontend during `docker compose build`. Changing them requires a rebuild.

**Runtime** variables are read when the container starts — no rebuild needed.

## Blacklist File

To auto-populate the subgraph blacklist, create a `blacklist.txt` file with one deployment IPFS hash per line. Lines starting with `#` are comments.

```
# Broken subgraphs
QmcGkFYhPfNDcwZj3w6BiVDYpaSopHFc8mRydDgDsrYFVy
QmUEeCy6fe8KZMBCGwf9mSS91XcXTvqJ9NpQgvpAkgvp78
```

Mount the file into the frontend container:

```yaml
# docker-compose.yml
services:
  frontend:
    volumes:
      - ./blacklist.txt:/app/config/blacklist.txt
```

File-loaded entries appear as read-only in Settings > General under **Subgraph Blacklist (from file)**. Additional manual entries can be added in the **Subgraph Blacklist (Manual)** textarea. Both lists are merged when the Blacklist filter is enabled.

## Chain Validation RPCs

Set per-chain RPC endpoints via environment variable:

```
CHAIN_VALIDATION_RPCS='{"mainnet":"https://eth.erpc.example.com","arbitrum-one":"https://arb.erpc.example.com"}'
```

Supported chain names: `mainnet`, `arbitrum-one`, `matic`, `gnosis`, `base`, `sepolia`, `arbitrum-sepolia`

UI settings (stored in localStorage) take priority over the environment variable.
