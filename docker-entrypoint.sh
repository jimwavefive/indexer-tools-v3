#!/bin/sh

CHAIN_VALIDATION_RPCS_VALUE="${CHAIN_VALIDATION_RPCS:-empty}"
if [ "$CHAIN_VALIDATION_RPCS_VALUE" = "empty" ]; then
  CHAIN_VALIDATION_RPCS_VALUE='{}'
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

echo $JSON_STRING > /app/public/indexer-tools-config.json

echo $JSON_STRING > /app/dist/indexer-tools-config.json

# Copy blacklist file if mounted
if [ -f /app/config/blacklist.txt ]; then
  cp /app/config/blacklist.txt /app/dist/blacklist.txt
  cp /app/config/blacklist.txt /app/public/blacklist.txt
fi

exec "$@"