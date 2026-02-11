import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqliteStore } from '../../db/sqliteStore.js';
import type { RuleConfig } from '../../services/notifications/rules/Rule.js';
import type { ChannelConfig } from '../../services/notifications/channels/Channel.js';
import type { PollingScheduler } from '../../services/poller/scheduler.js';
import type { SseManager } from '../../services/sse/SseManager.js';
import { getChainRpcService } from '../../services/rpc/ChainRpcService.js';

/** Validate that a webhook URL is safe to fetch (SSRF protection). */
function isAllowedWebhookUrl(urlStr: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = ['discord.com', 'discordapp.com'];
  if (!allowedHosts.some((h) => hostname === h || hostname.endsWith('.' + h))) {
    return { ok: false, reason: 'Only Discord webhook URLs are allowed' };
  }

  return { ok: true };
}

/** Handle fix commands for failed-subgraph incidents (graphman rewind). */
async function handleFailedSubgraphFix(
  incident: any,
  scheduler: PollingScheduler | undefined,
  res: Response,
): Promise<void> {
  const metadata = incident.latest_metadata as Record<string, unknown>;
  const subgraphs = (metadata?.subgraphs as Array<{ deploymentHash: string; name: string; allocatedGRT: string; errorMessage?: string }>) || [];

  if (subgraphs.length === 0) {
    res.json({ fixType: 'failed_subgraph', rewindableDeployments: [], deterministicFailures: [], unknownDeployments: [], commands: [], containerName: '' });
    return;
  }

  // Fetch fresh deployment statuses directly from graph-node (not cache)
  const hashes = subgraphs.map((sg) => sg.deploymentHash).filter(Boolean);
  let statuses: Map<string, any>;
  try {
    if (!scheduler) {
      throw new Error('Scheduler not initialized');
    }
    statuses = await scheduler.fetchFreshDeploymentStatuses(hashes);
  } catch (err: any) {
    console.error('Failed to fetch fresh deployment statuses:', err.message);
    res.status(503).json({ error: `Failed to fetch deployment statuses from graph-node: ${err.message}` });
    return;
  }

  // Classify deployments using fatalError.deterministic from graph-node:
  //   rewindable: nondeterministic errors (transient, will likely succeed on retry)
  //              OR stale (synced past error block, just needs error flag cleared)
  //   deterministic: deterministic code bugs that will reproduce on rewind
  const rewindableDeployments: Array<{ hash: string; name: string; chainId: string; chainNetwork: string; latestBlock: number; error: string; reason: string; allocatedGRT: string }> = [];
  const deterministicFailures: Array<{ hash: string; name: string; error: string; allocatedGRT: string }> = [];
  const unknownDeployments: Array<{ hash: string; name: string; allocatedGRT: string }> = [];

  const networkToChainId = (network: string) =>
    network === 'mainnet' ? '1'
    : network === 'arbitrum-one' ? '42161'
    : network === 'gnosis' ? '100'
    : network === 'base' ? '8453'
    : network === 'matic' ? '137'
    : network === 'optimism' ? '10'
    : network === 'avalanche' ? '43114'
    : network === 'celo' ? '42220'
    : network;

  for (const sg of subgraphs) {
    const hash = sg.deploymentHash;
    if (!hash) continue;

    const status = statuses.get(hash);
    if (!status) {
      unknownDeployments.push({ hash, name: sg.name || hash.substring(0, 12), allocatedGRT: sg.allocatedGRT });
      continue;
    }

    if (status.health !== 'failed') {
      // Not failed anymore — skip (auto-resolved or healthy)
      continue;
    }

    const primaryChain = status.chains?.[0];
    const network = primaryChain?.network || 'unknown';
    const chainId = networkToChainId(network);
    const latestBlock = parseInt(primaryChain?.latestBlock?.number || '0', 10);
    const errorMsg = status.fatalError?.message?.substring(0, 200) || 'unknown error';
    const isDeterministic = status.fatalError?.deterministic === true;
    const isSynced = status.synced === true;

    if (isDeterministic && !isSynced) {
      // Deterministic error, not synced — code bug, rewind will reproduce the same error
      deterministicFailures.push({
        hash,
        name: sg.name || hash.substring(0, 12),
        error: errorMsg,
        allocatedGRT: sg.allocatedGRT,
      });
    } else {
      // Rewindable: nondeterministic (transient error) OR stale (synced past the error block)
      const reason = !status.fatalError ? 'stale (no fatal error)'
        : isDeterministic ? 'stale (synced past error block)'
        : 'nondeterministic (transient error)';
      rewindableDeployments.push({
        hash,
        name: sg.name || hash.substring(0, 12),
        chainId,
        chainNetwork: network,
        latestBlock,
        error: errorMsg,
        reason,
        allocatedGRT: sg.allocatedGRT,
      });
    }
  }

  // Generate graphman rewind commands for rewindable deployments
  const containerName = process.env.GRAPHMAN_CONTAINER_NAME || 'index-node-mgmt-0';
  const rpcService = getChainRpcService();

  // Resolve RPC URLs for each chain used
  const chainRpcUrls = new Map<string, string>();
  for (const d of rewindableDeployments) {
    if (!chainRpcUrls.has(d.chainId)) {
      const url = rpcService.getRpcUrl(d.chainId);
      chainRpcUrls.set(d.chainId, url || `<RPC_URL_FOR_CHAIN_${d.chainId}>`);
    }
  }

  const commands = rewindableDeployments.map((d) => {
    const rewindBlock = d.latestBlock - 1;
    const blockHex = `0x${rewindBlock.toString(16)}`;
    const rpcUrl = chainRpcUrls.get(d.chainId) || `<RPC_URL_FOR_CHAIN_${d.chainId}>`;
    return {
      deploymentHash: d.hash,
      name: d.name,
      blockNumber: rewindBlock,
      chainId: d.chainId,
      chainNetwork: d.chainNetwork,
      command: `docker exec ${containerName} graphman rewind --block-hash <BLOCK_HASH> --block-number ${rewindBlock} ${d.hash}`,
      hashLookup: `curl -s -X POST ${rpcUrl} -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"eth_getBlockByNumber","params":["${blockHex}",false],"id":1}' | jq -r '.result.hash'`,
    };
  });

  // Generate a complete bash script that handles everything
  let script = `#!/bin/bash\n# Auto-generated graphman rewind script\n# Generated: ${new Date().toISOString()}\n# Incident: ${incident.id}\n#\n# ${rewindableDeployments.length} rewindable deployment(s)\n# ${deterministicFailures.length} deterministic failure(s) (not fixable by rewind)\n\nCONTAINER="${containerName}"\nSUCCESS=0\nFAILED=0\nFAILED_LIST=""\n`;

  script += `\nget_block_hash() {
  local rpc_url="$1"
  local block_hex="$2"
  local hash
  hash=$(curl -sf -X POST "$rpc_url" \\
    -H 'Content-Type: application/json' \\
    -d "{\\"jsonrpc\\":\\"2.0\\",\\"method\\":\\"eth_getBlockByNumber\\",\\"params\\":[\\"$block_hex\\",false],\\"id\\":1}" \\
    | jq -r '.result.hash')
  if [ -z "$hash" ] || [ "$hash" = "null" ]; then
    echo "ERROR: Failed to fetch block hash" >&2
    return 1
  fi
  echo "$hash"
}

do_rewind() {
  local rpc_url="$1"
  local block_num="$2"
  local deployment="$3"
  local block_hex
  block_hex=$(printf '0x%x' "$block_num")
  local bh
  bh=$(get_block_hash "$rpc_url" "$block_hex") || return 1
  local output
  output=$(docker exec "$CONTAINER" graphman rewind --block-hash "$bh" --block-number "$block_num" "$deployment" 2>&1)
  local rc=$?
  echo "$output"
  if [ $rc -eq 0 ]; then
    return 0
  fi
  # If graphman suggests a safe block, retry with that
  local safe_block
  safe_block=$(echo "$output" | grep -oP 'safely rewind to block number \\K[0-9]+')
  if [ -n "$safe_block" ]; then
    echo "  Retrying with safe block $safe_block..."
    local safe_hex
    safe_hex=$(printf '0x%x' "$safe_block")
    local safe_bh
    safe_bh=$(get_block_hash "$rpc_url" "$safe_hex") || return 1
    docker exec "$CONTAINER" graphman rewind --block-hash "$safe_bh" --block-number "$safe_block" "$deployment" 2>&1
    return $?
  fi
  return $rc
}
`;

  // Group by chain for efficiency
  const byChain = new Map<string, typeof rewindableDeployments>();
  for (const d of rewindableDeployments) {
    const key = d.chainId;
    if (!byChain.has(key)) byChain.set(key, []);
    byChain.get(key)!.push(d);
  }

  for (const [chainId, deployments] of byChain) {
    const network = deployments[0].chainNetwork;
    const rpcUrl = chainRpcUrls.get(chainId) || `<RPC_URL_FOR_CHAIN_${chainId}>`;
    script += `\n# --- Chain: ${network} (${chainId}) - ${deployments.length} deployment(s) ---\n`;

    for (const d of deployments) {
      const rewindBlock = d.latestBlock - 1;
      script += `\n# ${d.name} (${d.reason})\necho "Rewinding ${d.hash.substring(0, 12)}... (${d.name}) to block ${rewindBlock}"\nif do_rewind "${rpcUrl}" ${rewindBlock} ${d.hash}; then\n  echo "  Done."\n  SUCCESS=$((SUCCESS + 1))\nelse\n  echo "  FAILED"\n  FAILED=$((FAILED + 1))\n  FAILED_LIST="$FAILED_LIST\\n  - ${d.name} (${d.hash.substring(0, 16)}...)"\nfi\n`;
    }
  }

  script += '\necho ""\necho "========================================"\necho "Results: $SUCCESS succeeded, $FAILED failed"\nif [ $FAILED -gt 0 ]; then\n  echo -e "\\nFailed deployments:$FAILED_LIST"\nfi\n';

  res.json({
    fixType: 'failed_subgraph',
    rewindableDeployments,
    deterministicFailures,
    unknownDeployments,
    commands,
    script,
    containerName,
    totalFailed: subgraphs.length,
  });
}

/** Handle fix commands for behind-chainhead incidents (graphman restart). */
async function handleBehindChainheadFix(
  incident: any,
  scheduler: PollingScheduler | undefined,
  res: Response,
): Promise<void> {
  const metadata = incident.latest_metadata as Record<string, unknown>;
  const subgraphs = (metadata?.subgraphs as Array<{
    deploymentHash: string;
    name: string;
    allocatedGRT: string;
    blocksBehind: number;
  }>) || [];

  if (subgraphs.length === 0) {
    res.json({ fixType: 'behind_chainhead', behindDeployments: [], failedDeployments: [], syncedDeployments: [], unknownDeployments: [], script: '', containerName: '' });
    return;
  }

  // Fetch fresh deployment statuses directly from graph-node
  const hashes = subgraphs.map((sg) => sg.deploymentHash).filter(Boolean);
  let statuses: Map<string, any>;
  try {
    if (!scheduler) {
      throw new Error('Scheduler not initialized');
    }
    statuses = await scheduler.fetchFreshDeploymentStatuses(hashes);
  } catch (err: any) {
    console.error('Failed to fetch fresh deployment statuses:', err.message);
    res.status(503).json({ error: `Failed to fetch deployment statuses from graph-node: ${err.message}` });
    return;
  }

  const blocksBehindThreshold = (metadata?.blocksBehindThreshold as number) ?? 5000;
  const containerName = process.env.GRAPHMAN_CONTAINER_NAME || 'index-node-mgmt-0';

  const behindDeployments: Array<{ hash: string; name: string; network: string; latestBlock: number; chainHeadBlock: number; blocksBehind: number; allocatedGRT: string }> = [];
  const failedDeployments: Array<{ hash: string; name: string; error: string; allocatedGRT: string }> = [];
  const syncedDeployments: Array<{ hash: string; name: string; allocatedGRT: string }> = [];
  const unknownDeployments: Array<{ hash: string; name: string; allocatedGRT: string }> = [];

  for (const sg of subgraphs) {
    const hash = sg.deploymentHash;
    if (!hash) continue;

    const status = statuses.get(hash);
    if (!status) {
      unknownDeployments.push({ hash, name: sg.name || hash.substring(0, 12), allocatedGRT: sg.allocatedGRT });
      continue;
    }

    const primaryChain = status.chains?.[0];
    const chainHead = parseInt(primaryChain?.chainHeadBlock?.number || '0', 10);
    const latestBlock = parseInt(primaryChain?.latestBlock?.number || '0', 10);
    const blocksBehind = chainHead - latestBlock;
    const network = primaryChain?.network || 'unknown';

    if (status.health === 'failed') {
      failedDeployments.push({
        hash,
        name: sg.name || hash.substring(0, 12),
        error: status.fatalError?.message?.substring(0, 200) || 'failed',
        allocatedGRT: sg.allocatedGRT,
      });
    } else if (blocksBehind < blocksBehindThreshold) {
      syncedDeployments.push({
        hash,
        name: sg.name || hash.substring(0, 12),
        allocatedGRT: sg.allocatedGRT,
      });
    } else {
      behindDeployments.push({
        hash,
        name: sg.name || hash.substring(0, 12),
        network,
        latestBlock,
        chainHeadBlock: chainHead,
        blocksBehind,
        allocatedGRT: sg.allocatedGRT,
      });
    }
  }

  // Generate bash script for diagnosing and restarting behind deployments
  let script = '';
  if (behindDeployments.length > 0) {
    script = generateBehindChainheadScript(behindDeployments, containerName, incident.id);
  }

  res.json({
    fixType: 'behind_chainhead',
    behindDeployments,
    failedDeployments,
    syncedDeployments,
    unknownDeployments,
    script,
    containerName,
  });
}

/** Generate a self-contained bash script to diagnose and restart behind-chainhead deployments. */
function generateBehindChainheadScript(
  deployments: Array<{ hash: string; name: string; network: string; latestBlock: number; chainHeadBlock: number; blocksBehind: number; allocatedGRT: string }>,
  containerName: string,
  incidentId: string,
): string {
  // Build parallel arrays for the bash script
  const hashesArr = deployments.map((d) => `"${d.hash}"`).join(' ');
  const namesArr = deployments.map((d) => `"${d.name.replace(/"/g, '\\"')}"`).join(' ');

  return `#!/bin/bash
# Auto-generated behind-chainhead diagnosis & restart script
# Generated: ${new Date().toISOString()}
# Incident: ${incidentId}
#
# ${deployments.length} deployment(s) behind chainhead
#
# Workflow:
#   1. Snapshot latest block for each deployment (parallel)
#   2. Wait 2 minutes, snapshot again to detect progress (parallel)
#   3. Diagnose stopped deployments — single graphman info -s call each (parallel)
#   4. Restart eligible stopped deployments
#   5. Wait 10 minutes, check if restarted deployments are advancing (parallel)
#   6. Report results

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
CONTAINER="${containerName}"
WAIT_SHORT=120   # seconds between snapshot 1 and 2
WAIT_LONG=600    # seconds after restart before final check

# ── Colors ───────────────────────────────────────────────────────────
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
CYAN='\\033[0;36m'
BOLD='\\033[1m'
NC='\\033[0m' # No Color

# ── Deployments ──────────────────────────────────────────────────────
HASHES=(${hashesArr})
NAMES=(${namesArr})
COUNT=\${#HASHES[@]}

# ── Temp dir for parallel results ────────────────────────────────────
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# ── Result arrays ────────────────────────────────────────────────────
SLOW_SYNC=()
RESTARTED=()
RECOVERING=()
STILL_STOPPED=()
PAUSED=()
FAILED=()
UNASSIGNED=()
INACTIVE=()

# ── Helper: get latest block from graphman info ──────────────────────
get_latest_block() {
  local hash="$1"
  docker exec "$CONTAINER" graphman info "$hash" 2>/dev/null \\
    | grep "Latest Block" | awk -F'|' '{print $2}' | xargs
}

# ── Helper: parse field from already-captured graphman info -s output ─
parse_info_field() {
  local output="$1"
  local field="$2"
  echo "$output" | grep "$field" | awk -F'|' '{print $2}' | xargs
}

echo -e "\${BOLD}Behind-Chainhead Diagnosis Script\${NC}"
echo -e "Checking \${COUNT} deployment(s)..."
echo ""

# ══════════════════════════════════════════════════════════════════════
# STEP 1: Snapshot 1 — record current latest block (parallel)
# ══════════════════════════════════════════════════════════════════════
echo -e "\${CYAN}[Step 1/6]\${NC} Taking first block snapshot..."
for i in "\${!HASHES[@]}"; do
  (
    hash="\${HASHES[$i]}"
    block=$(get_latest_block "$hash" 2>/dev/null || echo "0")
    echo "\${block:-0}" > "$TMPDIR/snap1_$i"
  ) &
done
wait

declare -A BLOCKS_1
for i in "\${!HASHES[@]}"; do
  block=$(cat "$TMPDIR/snap1_$i" 2>/dev/null || echo "0")
  BLOCKS_1["\${HASHES[$i]}"]="\${block}"
  echo "  \${NAMES[$i]}: block \${block}"
done

# ══════════════════════════════════════════════════════════════════════
# STEP 2: Wait, then snapshot 2 (parallel)
# ══════════════════════════════════════════════════════════════════════
echo ""
echo -e "\${CYAN}[Step 2/6]\${NC} Waiting \${WAIT_SHORT}s to detect block progress..."
sleep "$WAIT_SHORT"

echo -e "\${CYAN}[Step 3/6]\${NC} Taking second block snapshot..."
for i in "\${!HASHES[@]}"; do
  (
    hash="\${HASHES[$i]}"
    block=$(get_latest_block "$hash" 2>/dev/null || echo "0")
    echo "\${block:-0}" > "$TMPDIR/snap2_$i"
  ) &
done
wait

declare -A BLOCKS_2
STOPPED_HASHES=()
STOPPED_INDICES=()

for i in "\${!HASHES[@]}"; do
  hash="\${HASHES[$i]}"
  name="\${NAMES[$i]}"
  block=$(cat "$TMPDIR/snap2_$i" 2>/dev/null || echo "0")
  BLOCKS_2["$hash"]="\${block}"
  prev="\${BLOCKS_1[$hash]}"

  if [ "\${block:-0}" -gt "\${prev:-0}" ] 2>/dev/null; then
    echo -e "  \${GREEN}$name: block $prev → $block (advancing)\${NC}"
    SLOW_SYNC+=("$name")
  else
    echo -e "  \${YELLOW}$name: block $prev → $block (no progress)\${NC}"
    STOPPED_HASHES+=("$hash")
    STOPPED_INDICES+=("$i")
  fi
done

if [ \${#STOPPED_HASHES[@]} -eq 0 ]; then
  echo ""
  echo -e "\${GREEN}\${BOLD}All deployments are making progress (slow sync). No restarts needed.\${NC}"
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo -e "\${BOLD}Summary\${NC}"
  echo "═══════════════════════════════════════════════════"
  echo -e "  \${GREEN}Slow sync (advancing):\${NC} \${#SLOW_SYNC[@]}"
  for name in "\${SLOW_SYNC[@]}"; do echo "    - $name"; done
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════
# STEP 4: Diagnose stopped deployments (parallel — one graphman info -s each)
# ══════════════════════════════════════════════════════════════════════
echo ""
echo -e "\${CYAN}[Step 4/6]\${NC} Diagnosing \${#STOPPED_HASHES[@]} stopped deployment(s)..."

# Fetch all info in parallel
for j in "\${!STOPPED_HASHES[@]}"; do
  (
    hash="\${STOPPED_HASHES[$j]}"
    docker exec "$CONTAINER" graphman info -s "$hash" 2>/dev/null > "$TMPDIR/diag_$j" || true
  ) &
done
wait

RESTART_HASHES=()
RESTART_INDICES=()

for j in "\${!STOPPED_HASHES[@]}"; do
  hash="\${STOPPED_HASHES[$j]}"
  idx="\${STOPPED_INDICES[$j]}"
  name="\${NAMES[$idx]}"
  info=$(cat "$TMPDIR/diag_$j" 2>/dev/null || echo "")

  paused=$(parse_info_field "$info" "Paused")
  node_id=$(parse_info_field "$info" "Node ID")
  health=$(parse_info_field "$info" "Health")
  active=$(parse_info_field "$info" "Active")

  if [ "$paused" = "true" ]; then
    echo -e "  \${YELLOW}$name: PAUSED — skipping (unpause manually)\${NC}"
    PAUSED+=("$name")
  elif [ -z "$node_id" ] || [ "$node_id" = "" ]; then
    echo -e "  \${RED}$name: NOT ASSIGNED to any node — skipping\${NC}"
    UNASSIGNED+=("$name")
  elif [ "$health" = "failed" ]; then
    echo -e "  \${RED}$name: FAILED health — use failed-subgraph fix instead\${NC}"
    FAILED+=("$name")
  elif [ "$active" = "false" ]; then
    echo -e "  \${YELLOW}$name: INACTIVE — skipping\${NC}"
    INACTIVE+=("$name")
  else
    echo -e "  \${CYAN}$name: eligible for restart (node=$node_id, health=$health)\${NC}"
    RESTART_HASHES+=("$hash")
    RESTART_INDICES+=("$idx")
  fi
done

if [ \${#RESTART_HASHES[@]} -eq 0 ]; then
  echo ""
  echo -e "\${YELLOW}No deployments eligible for restart.\${NC}"
else
  # ════════════════════════════════════════════════════════════════════
  # STEP 5: Restart eligible deployments (sequential — safer)
  # ════════════════════════════════════════════════════════════════════
  echo ""
  echo -e "\${CYAN}[Step 5/6]\${NC} Restarting \${#RESTART_HASHES[@]} deployment(s)..."
  for k in "\${!RESTART_HASHES[@]}"; do
    hash="\${RESTART_HASHES[$k]}"
    idx="\${RESTART_INDICES[$k]}"
    name="\${NAMES[$idx]}"
    echo -n "  Restarting $name... "
    if docker exec "$CONTAINER" graphman restart "$hash" 2>&1; then
      echo -e "\${GREEN}done\${NC}"
      RESTARTED+=("$hash")
    else
      echo -e "\${RED}failed\${NC}"
    fi
  done

  # ════════════════════════════════════════════════════════════════════
  # STEP 6: Wait and verify restarts (parallel)
  # ════════════════════════════════════════════════════════════════════
  echo ""
  echo -e "\${CYAN}[Step 6/6]\${NC} Waiting \${WAIT_LONG}s for restarted deployments to begin syncing..."
  sleep "$WAIT_LONG"

  echo "Checking restarted deployments..."
  for k in "\${!RESTART_HASHES[@]}"; do
    (
      hash="\${RESTART_HASHES[$k]}"
      block=$(get_latest_block "$hash" 2>/dev/null || echo "0")
      echo "\${block:-0}" > "$TMPDIR/snap3_$k"
    ) &
  done
  wait

  for k in "\${!RESTART_HASHES[@]}"; do
    hash="\${RESTART_HASHES[$k]}"
    idx="\${RESTART_INDICES[$k]}"
    name="\${NAMES[$idx]}"
    prev="\${BLOCKS_2[$hash]}"
    block=$(cat "$TMPDIR/snap3_$k" 2>/dev/null || echo "0")

    if [ "\${block:-0}" -gt "\${prev:-0}" ] 2>/dev/null; then
      echo -e "  \${GREEN}$name: block $prev → $block (recovering!)\${NC}"
      RECOVERING+=("$name")
    else
      echo -e "  \${RED}$name: block $prev → $block (still stopped)\${NC}"
      STILL_STOPPED+=("$name")
    fi
  done
fi

# ══════════════════════════════════════════════════════════════════════
# REPORT
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════"
echo -e "\${BOLD}Summary\${NC}"
echo "═══════════════════════════════════════════════════"
if [ \${#SLOW_SYNC[@]} -gt 0 ]; then
  echo -e "  \${GREEN}Slow sync (already advancing):\${NC} \${#SLOW_SYNC[@]}"
  for name in "\${SLOW_SYNC[@]}"; do echo "    - $name"; done
fi
if [ \${#RECOVERING[@]} -gt 0 ]; then
  echo -e "  \${GREEN}Restarted & recovering:\${NC} \${#RECOVERING[@]}"
  for name in "\${RECOVERING[@]}"; do echo "    - $name"; done
fi
if [ \${#STILL_STOPPED[@]} -gt 0 ]; then
  echo -e "  \${RED}Restarted but still stopped:\${NC} \${#STILL_STOPPED[@]}"
  for name in "\${STILL_STOPPED[@]}"; do echo "    - $name"; done
fi
if [ \${#PAUSED[@]} -gt 0 ]; then
  echo -e "  \${YELLOW}Paused (manual unpause needed):\${NC} \${#PAUSED[@]}"
  for name in "\${PAUSED[@]}"; do echo "    - $name"; done
fi
if [ \${#FAILED[@]} -gt 0 ]; then
  echo -e "  \${RED}Failed health (use failed-subgraph fix):\${NC} \${#FAILED[@]}"
  for name in "\${FAILED[@]}"; do echo "    - $name"; done
fi
if [ \${#UNASSIGNED[@]} -gt 0 ]; then
  echo -e "  \${RED}Not assigned to any node:\${NC} \${#UNASSIGNED[@]}"
  for name in "\${UNASSIGNED[@]}"; do echo "    - $name"; done
fi
if [ \${#INACTIVE[@]} -gt 0 ]; then
  echo -e "  \${YELLOW}Inactive:\${NC} \${#INACTIVE[@]}"
  for name in "\${INACTIVE[@]}"; do echo "    - $name"; done
fi
echo ""
`;
}

export function createNotificationRoutes(store: SqliteStore, scheduler?: PollingScheduler, sseManager?: SseManager): Router {
  const router = Router();

  // --- SSE Stream (must be registered before /incidents/:id to avoid matching 'stream' as :id) ---

  router.get('/api/notifications/incidents/stream', (req: Request, res: Response) => {
    if (!sseManager) {
      res.status(503).json({ error: 'SSE not available' });
      return;
    }
    sseManager.addClient(req, res);
  });

  // --- Rules ---

  router.get('/api/notifications/rules', async (_req: Request, res: Response) => {
    try {
      const rules = await store.getRules();
      res.json(rules);
    } catch (err) {
      console.error('Failed to get rules:', err);
      res.status(500).json({ error: 'Failed to get rules' });
    }
  });

  router.post('/api/notifications/rules', async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<RuleConfig>;
      if (!body.name || !body.type) {
        res.status(400).json({ error: 'name and type are required' });
        return;
      }

      const newRule: RuleConfig = {
        id: body.id || uuidv4(),
        name: body.name,
        type: body.type,
        enabled: body.enabled ?? true,
        conditions: body.conditions ?? {},
        pollingIntervalMinutes: body.pollingIntervalMinutes ?? null,
        channelIds: body.channelIds ?? [],
      };

      const rules = await store.getRules();
      rules.push(newRule);
      await store.saveRules(rules);

      // Sync rule timers to pick up the new rule
      if (scheduler) {
        scheduler.syncRuleTimers().catch((err) => {
          console.error('Failed to sync rule timers:', err);
        });
      }

      res.status(201).json(newRule);
    } catch (err) {
      console.error('Failed to create rule:', err);
      res.status(500).json({ error: 'Failed to create rule' });
    }
  });

  router.put('/api/notifications/rules/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body as Partial<RuleConfig>;
      const rules = await store.getRules();
      const index = rules.findIndex((r) => r.id === id);

      if (index === -1) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      rules[index] = {
        ...rules[index],
        ...body,
        id, // Prevent ID changes
      };

      await store.saveRules(rules);

      // Sync rule timers to pick up changes (enabled state, polling interval)
      if (scheduler) {
        scheduler.syncRuleTimers().catch((err) => {
          console.error('Failed to sync rule timers:', err);
        });
      }

      res.json(rules[index]);
    } catch (err) {
      console.error('Failed to update rule:', err);
      res.status(500).json({ error: 'Failed to update rule' });
    }
  });

  router.delete('/api/notifications/rules/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rules = await store.getRules();
      const filtered = rules.filter((r) => r.id !== id);

      if (filtered.length === rules.length) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      await store.saveRules(filtered);

      // Sync rule timers to remove the deleted rule's timer
      if (scheduler) {
        scheduler.syncRuleTimers().catch((err) => {
          console.error('Failed to sync rule timers:', err);
        });
      }

      res.status(204).send();
    } catch (err) {
      console.error('Failed to delete rule:', err);
      res.status(500).json({ error: 'Failed to delete rule' });
    }
  });

  // --- Rule Test ---

  router.post('/api/notifications/rules/:id/test', async (req: Request, res: Response) => {
    try {
      if (!scheduler) {
        res.status(503).json({ error: 'Polling scheduler not available' });
        return;
      }

      const result = await scheduler.testRule(req.params.id);

      if (result.error) {
        res.status(result.status || 500).json({ error: result.error });
        return;
      }

      res.json(result);
    } catch (err) {
      console.error('Failed to test rule:', err);
      res.status(500).json({ error: 'Failed to test rule' });
    }
  });

  // --- Channels ---

  router.get('/api/notifications/channels', async (_req: Request, res: Response) => {
    try {
      const channels = await store.getChannels();
      // Mask sensitive config values in the response
      const masked = channels.map((ch) => ({
        ...ch,
        config: {
          ...ch.config,
          ...(ch.config?.webhookUrl
            ? { webhookUrl: '••••••••' + (ch.config.webhookUrl as string).slice(-8) }
            : {}),
        },
      }));
      res.json(masked);
    } catch (err) {
      console.error('Failed to get channels:', err);
      res.status(500).json({ error: 'Failed to get channels' });
    }
  });

  router.post('/api/notifications/channels', async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<ChannelConfig>;
      if (!body.name || !body.type) {
        res.status(400).json({ error: 'name and type are required' });
        return;
      }

      const newChannel: ChannelConfig = {
        id: body.id || uuidv4(),
        name: body.name,
        type: body.type,
        enabled: body.enabled ?? true,
        config: body.config ?? {},
      };

      const channels = await store.getChannels();
      channels.push(newChannel);
      await store.saveChannels(channels);

      res.status(201).json(newChannel);
    } catch (err) {
      console.error('Failed to create channel:', err);
      res.status(500).json({ error: 'Failed to create channel' });
    }
  });

  router.put('/api/notifications/channels/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body as Partial<ChannelConfig>;
      const channels = await store.getChannels();
      const index = channels.findIndex((c) => c.id === id);

      if (index === -1) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      // If no config provided, preserve existing config (supports masked webhook editing)
      const updatedConfig = body.config ?? channels[index].config;
      channels[index] = {
        ...channels[index],
        ...body,
        id, // Prevent ID changes
        config: updatedConfig,
      };

      await store.saveChannels(channels);
      // Mask sensitive config in response
      const responseChannel = {
        ...channels[index],
        config: {
          ...channels[index].config,
          ...(channels[index].config?.webhookUrl
            ? { webhookUrl: '••••••••' + (channels[index].config.webhookUrl as string).slice(-8) }
            : {}),
        },
      };
      res.json(responseChannel);
    } catch (err) {
      console.error('Failed to update channel:', err);
      res.status(500).json({ error: 'Failed to update channel' });
    }
  });

  router.delete('/api/notifications/channels/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const channels = await store.getChannels();
      const filtered = channels.filter((c) => c.id !== id);

      if (filtered.length === channels.length) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      await store.saveChannels(filtered);
      res.status(204).send();
    } catch (err) {
      console.error('Failed to delete channel:', err);
      res.status(500).json({ error: 'Failed to delete channel' });
    }
  });

  // --- Channel Test ---

  router.post('/api/notifications/channels/test', async (req: Request, res: Response) => {
    try {
      const { webhookUrl } = req.body as { webhookUrl?: string };
      if (!webhookUrl) {
        res.status(400).json({ error: 'webhookUrl is required' });
        return;
      }

      const urlCheck = isAllowedWebhookUrl(webhookUrl);
      if (!urlCheck.ok) {
        res.status(400).json({ error: `Invalid webhook URL: ${urlCheck.reason}` });
        return;
      }

      const embed = {
        title: 'Indexer Tools — Test Notification',
        description: 'This is a test notification from Indexer Tools.',
        color: 0x00aaff,
        timestamp: new Date().toISOString(),
        footer: { text: 'Test notification' },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => 'unknown error');
        res.status(502).json({ error: `Discord webhook failed (${response.status}): ${text}` });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Failed to test channel:', err);
      res.status(500).json({ error: 'Failed to test channel' });
    }
  });

  // --- History ---

  router.get('/api/notifications/history', async (_req: Request, res: Response) => {
    try {
      const history = await store.getHistory();
      res.json(history);
    } catch (err) {
      console.error('Failed to get history:', err);
      res.status(500).json({ error: 'Failed to get history' });
    }
  });

  router.delete('/api/notifications/history', async (_req: Request, res: Response) => {
    try {
      await store.clearHistory();
      res.status(204).send();
    } catch (err) {
      console.error('Failed to clear history:', err);
      res.status(500).json({ error: 'Failed to clear history' });
    }
  });

  // --- Incidents ---

  router.get('/api/notifications/incidents', async (req: Request, res: Response) => {
    try {
      const status = (req.query.status as string) || 'open';
      const limit = parseInt((req.query.limit as string) || '100', 10);
      const offset = parseInt((req.query.offset as string) || '0', 10);
      const incidents = store.getIncidents({ status, limit, offset });
      res.json(incidents);
    } catch (err) {
      console.error('Failed to get incidents:', err);
      res.status(500).json({ error: 'Failed to get incidents' });
    }
  });

  router.get('/api/notifications/incidents/:id', async (req: Request, res: Response) => {
    try {
      const incident = store.getIncidentById(req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }
      res.json(incident);
    } catch (err) {
      console.error('Failed to get incident:', err);
      res.status(500).json({ error: 'Failed to get incident' });
    }
  });

  router.put('/api/notifications/incidents/:id/acknowledge', async (req: Request, res: Response) => {
    try {
      const incident = store.getIncidentById(req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }
      store.updateIncident(req.params.id, { status: 'acknowledged' });

      sseManager?.broadcast({
        type: 'incident:acknowledged',
        incidentId: incident.id,
        ruleId: incident.rule_id,
        status: 'acknowledged',
        severity: incident.severity,
        targetLabel: incident.target_label,
        title: incident.latest_title,
        timestamp: new Date().toISOString(),
      });

      res.json({ ...incident, status: 'acknowledged' });
    } catch (err) {
      console.error('Failed to acknowledge incident:', err);
      res.status(500).json({ error: 'Failed to acknowledge incident' });
    }
  });

  router.put('/api/notifications/incidents/:id/resolve', async (req: Request, res: Response) => {
    try {
      const incident = store.getIncidentById(req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }
      const resolvedAt = new Date().toISOString();
      store.updateIncident(req.params.id, {
        status: 'resolved',
        resolved_at: resolvedAt,
      });

      sseManager?.broadcast({
        type: 'incident:resolved',
        incidentId: incident.id,
        ruleId: incident.rule_id,
        status: 'resolved',
        severity: incident.severity,
        targetLabel: incident.target_label,
        title: incident.latest_title,
        timestamp: resolvedAt,
      });

      res.json({ ...incident, status: 'resolved', resolved_at: resolvedAt });
    } catch (err) {
      console.error('Failed to resolve incident:', err);
      res.status(500).json({ error: 'Failed to resolve incident' });
    }
  });

  // --- Fix Commands (route to appropriate handler based on rule type) ---

  router.get('/api/notifications/incidents/:id/fix-commands', async (req: Request, res: Response) => {
    try {
      const incident = store.getIncidentById(req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }

      // Determine rule type
      const rules = await store.getRules();
      const rule = rules.find((r: any) => r.id === incident.rule_id);
      const ruleType = rule?.type || '';

      if (ruleType === 'behind_chainhead') {
        await handleBehindChainheadFix(incident, scheduler, res);
      } else if (ruleType.startsWith('failed_subgraph')) {
        await handleFailedSubgraphFix(incident, scheduler, res);
      } else {
        res.status(400).json({ error: `Fix commands not supported for rule type: ${ruleType || 'unknown'}` });
      }
    } catch (err) {
      console.error('Failed to generate fix commands:', err);
      res.status(500).json({ error: 'Failed to generate fix commands' });
    }
  });

  // --- Settings ---

  router.get('/api/notifications/settings', async (_req: Request, res: Response) => {
    try {
      const settings = store.getSettings();
      res.json({
        pollingIntervalMinutes: parseInt(settings.pollingIntervalMinutes || '60', 10),
      });
    } catch (err) {
      console.error('Failed to get settings:', err);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  router.put('/api/notifications/settings', async (req: Request, res: Response) => {
    try {
      const { pollingIntervalMinutes } = req.body as {
        pollingIntervalMinutes?: number;
      };

      if (pollingIntervalMinutes !== undefined) {
        const clamped = Math.max(1, Math.min(120, pollingIntervalMinutes));
        store.setSetting('pollingIntervalMinutes', String(clamped));

        if (scheduler) {
          scheduler.updateInterval(clamped);
        }
      }

      const settings = store.getSettings();
      res.json({
        pollingIntervalMinutes: parseInt(settings.pollingIntervalMinutes || '60', 10),
      });
    } catch (err) {
      console.error('Failed to update settings:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}
