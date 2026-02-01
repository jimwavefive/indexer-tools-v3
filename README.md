# Indexer Tools v3

## About

Indexer Tools is a dashboard for indexers on [The Graph](https://thegraph.com/) decentralized network. It provides tools for viewing allocations, filtering subgraphs, calculating allocation effectiveness, and managing indexer operations.

Built with Vue 3 (Composition API), Vuetify 3, and Pinia.

## Features

**Subgraphs Dashboard** — Browse and filter all subgraphs by signal, network, rewards status, deployment status, and more. An **Auto Target APR** mode calculates the optimal target APR to fully allocate your available stake, iteratively excluding overstaked subgraphs. A **Hide 0% APR** filter removes zero-yield subgraphs from the list.

**Allocations Dashboard** — View current allocations with APR, daily rewards, pending rewards, and QoS metrics. Export to CSV.

**Allocation Wizard** — Step-by-step workflow to close existing allocations, select new subgraphs, set allocation amounts, and execute on-chain.

**Blacklist & Synclist** — Filter subgraphs via manual entries in the UI, or load a blacklist from a file (see [Blacklist File](#blacklist-file)). Both sources are merged when filtering is enabled.

**Chain Validation RPCs** — Configure per-chain RPC endpoints for block hash verification instead of using the default DRPC provider. Supports Ethereum Mainnet, Arbitrum One, Polygon, Gnosis, Base, Sepolia, and Arbitrum Sepolia. Configurable in the UI (Settings > Chain Validation RPCs) or via the `CHAIN_VALIDATION_RPCS` environment variable.

**Auto-Refresh** — Configurable dashboard refresh interval (Settings > General): Off, 1 min, 2 min, 5 min, or 10 min.

**Notifications** — In-app error and status notifications with retry logic for GraphQL queries.

# Custom Deployments

## API Keys

Custom deployments require a Graph Studio API key:
https://thegraph.com/studio/apikeys/

## Docker

### Requirements
* Docker
* Graph Protocol API Key

### Run Image

List of available environment variables [here](./DOCKER_ENV.md).

```
docker run \
  -p 3000:3000 \
  -e GRAPH_API_KEY=your-api-key \
  ghcr.io/vincenttaglia/indexer-tools
```

### Blacklist File

To auto-populate the subgraph blacklist, create a `blacklist.txt` file with one deployment IPFS hash per line. Lines starting with `#` are comments.

```
# Broken subgraphs
QmcGkFYhPfNDcwZj3w6BiVDYpaSopHFc8mRydDgDsrYFVy
QmUEeCy6fe8KZMBCGwf9mSS91XcXTvqJ9NpQgvpAkgvp78
```

Mount the file into the container:

```yaml
# docker-compose.yml
services:
  indexer-tools:
    image: ghcr.io/vincenttaglia/indexer-tools:latest
    ports:
      - "3000:3000"
    volumes:
      - ./blacklist.txt:/app/config/blacklist.txt
      - ./blacklist.txt:/app/dist/blacklist.txt
    env_file:
      - .env
```

Or with `docker run`:

```
docker run \
  -p 3000:3000 \
  -v ./blacklist.txt:/app/config/blacklist.txt \
  -v ./blacklist.txt:/app/dist/blacklist.txt \
  -e GRAPH_API_KEY=your-api-key \
  ghcr.io/vincenttaglia/indexer-tools
```

The `/app/dist/` mount ensures the file is served directly to the browser, so edits take effect on the next page load without restarting the container. The `/app/config/` mount is used by the entrypoint script to copy the file into `/app/public/` for dev mode.

File-loaded entries appear as read-only in Settings > General under **Subgraph Blacklist (from file)**. Additional manual entries can be added in the **Subgraph Blacklist (Manual)** textarea. Both lists are merged when the Blacklist filter is enabled.

### Chain Validation RPCs

Set per-chain RPC endpoints via environment variable:

```
CHAIN_VALIDATION_RPCS='{"mainnet":"https://eth.erpc.example.com","arbitrum-one":"https://arb.erpc.example.com"}'
```

UI settings (stored in localStorage) take priority over the environment variable.

## Build Manually

### Requirements
* Node v20
* Yarn
* Graph Protocol API Key

### Install Dependencies
```
yarn
```

### Set default variables
```
cp .env.example .env
```
```
sed -i "/VITE_GRAPH_API_KEY=/c\VITE_GRAPH_API_KEY=your-api-key" .env
```

### Compile and minify for production
```
yarn build
```

### Serve compiled app
```
yarn start
```
