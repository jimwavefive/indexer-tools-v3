#!/bin/sh

CHAIN_VALIDATION_RPCS_VALUE="${CHAIN_VALIDATION_RPCS:-empty}"
if [ "$CHAIN_VALIDATION_RPCS_VALUE" = "empty" ]; then
  CHAIN_VALIDATION_RPCS_VALUE='{}'
fi

# Determine paths - support both monorepo and standalone layouts
if [ -d /app/packages/frontend/dist ]; then
  DIST_DIR=/app/packages/frontend/dist
  PUBLIC_DIR=/app/packages/frontend/public
else
  DIST_DIR=/app/dist
  PUBLIC_DIR=/app/public
fi

JSON_STRING="{
  \"DEFAULT_ACCOUNTS\": ${DEFAULT_ACCOUNTS:-\"\"},
  \"DEFAULT_RPC_MAINNET\": \"${DEFAULT_RPC_MAINNET}\",
  \"DEFAULT_RPC_ARBITRUM\": \"${DEFAULT_RPC_ARBITRUM}\",
  \"DEFAULT_RPC_SEPOLIA\": \"${DEFAULT_RPC_SEPOLIA}\",
  \"DEFAULT_RPC_ARBITRUM_SEPOLIA\": \"${DEFAULT_RPC_ARBITRUM_SEPOLIA}\",
  \"DEFAULT_SUBGRAPH_MAINNET\": \"${DEFAULT_SUBGRAPH_MAINNET}\",
  \"DEFAULT_SUBGRAPH_ARBITRUM\": \"${DEFAULT_SUBGRAPH_ARBITRUM}\",
  \"DEFAULT_SUBGRAPH_SEPOLIA\": \"${DEFAULT_SUBGRAPH_SEPOLIA}\",
  \"DEFAULT_SUBGRAPH_ARBITRUM_SEPOLIA\": \"${DEFAULT_SUBGRAPH_ARBITRUM_SEPOLIA}\",
  \"DEFAULT_QOS_SUBGRAPH\": \"${DEFAULT_QOS_SUBGRAPH}\",
  \"GRAPH_API_KEY\": \"${GRAPH_API_KEY}\",
  \"CHAIN_VALIDATION_RPCS\": ${CHAIN_VALIDATION_RPCS_VALUE}
}"

mkdir -p "$PUBLIC_DIR"
printf '%s' "$JSON_STRING" > "$PUBLIC_DIR/indexer-tools-config.json"
printf '%s' "$JSON_STRING" > "$DIST_DIR/indexer-tools-config.json"

# Copy blacklist file if mounted
if [ -f /app/config/blacklist.txt ]; then
  cp /app/config/blacklist.txt "$DIST_DIR/blacklist.txt"
  cp /app/config/blacklist.txt "$PUBLIC_DIR/blacklist.txt"
fi

exec "$@"
