import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqliteStore } from '../../db/sqliteStore.js';
import type { RuleConfig } from '../../services/notifications/rules/Rule.js';
import type { ChannelConfig } from '../../services/notifications/channels/Channel.js';
import type { PollingScheduler } from '../../services/poller/scheduler.js';
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

export function createNotificationRoutes(store: SqliteStore, scheduler?: PollingScheduler): Router {
  const router = Router();

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
      store.updateIncident(req.params.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      });
      res.json({ ...incident, status: 'resolved', resolved_at: new Date().toISOString() });
    } catch (err) {
      console.error('Failed to resolve incident:', err);
      res.status(500).json({ error: 'Failed to resolve incident' });
    }
  });

  // --- Fix Commands (manual graphman rewind for stale failures) ---

  router.get('/api/notifications/incidents/:id/fix-commands', async (req: Request, res: Response) => {
    try {
      const incident = store.getIncidentById(req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }

      const metadata = incident.latest_metadata as Record<string, unknown>;
      const subgraphs = (metadata?.subgraphs as Array<{ deploymentHash: string; name: string; allocatedGRT: string; errorMessage?: string }>) || [];

      if (subgraphs.length === 0) {
        res.json({ staleDeployments: [], genuineFailures: [], commands: [], containerName: '' });
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

      const staleDeployments: Array<{ hash: string; name: string; chainId: string; chainNetwork: string; latestBlock: number; error: string; allocatedGRT: string }> = [];
      const genuineFailures: Array<{ hash: string; name: string; error: string; allocatedGRT: string }> = [];
      const unknownDeployments: Array<{ hash: string; name: string; allocatedGRT: string }> = [];

      for (const sg of subgraphs) {
        const hash = sg.deploymentHash;
        if (!hash) continue;

        const status = statuses.get(hash);
        if (!status) {
          unknownDeployments.push({ hash, name: sg.name || hash.substring(0, 12), allocatedGRT: sg.allocatedGRT });
          continue;
        }

        const allSynced = status.chains.every((c) => {
          const chainhead = parseInt(c.chainHeadBlock?.number || '0', 10);
          const latest = parseInt(c.latestBlock?.number || '0', 10);
          return (chainhead - latest) < 100;
        });

        if (status.health === 'failed' && allSynced) {
          const primaryChain = status.chains[0];
          const network = primaryChain?.network || 'unknown';
          const chainId = network === 'mainnet' ? '1'
            : network === 'arbitrum-one' ? '42161'
            : network === 'gnosis' ? '100'
            : network === 'base' ? '8453'
            : network === 'matic' ? '137'
            : network === 'optimism' ? '10'
            : network === 'avalanche' ? '43114'
            : network === 'celo' ? '42220'
            : network;
          const latestBlock = parseInt(primaryChain?.latestBlock?.number || '0', 10);

          staleDeployments.push({
            hash,
            name: sg.name || hash.substring(0, 12),
            chainId,
            chainNetwork: network,
            latestBlock,
            error: status.fatalError?.message?.substring(0, 200) || 'unknown error',
            allocatedGRT: sg.allocatedGRT,
          });
        } else {
          genuineFailures.push({
            hash,
            name: sg.name || hash.substring(0, 12),
            error: status.fatalError?.message?.substring(0, 200) || (status.health === 'failed' ? 'failed (not synced)' : `health: ${status.health}`),
            allocatedGRT: sg.allocatedGRT,
          });
        }
      }

      // Generate graphman rewind commands for stale deployments
      const containerName = process.env.GRAPHMAN_CONTAINER_NAME || 'index-node-mgmt-0';
      const rpcService = getChainRpcService();

      // Resolve RPC URLs for each chain used
      const chainRpcUrls = new Map<string, string>();
      for (const d of staleDeployments) {
        if (!chainRpcUrls.has(d.chainId)) {
          const url = rpcService.getRpcUrl(d.chainId);
          chainRpcUrls.set(d.chainId, url || `<RPC_URL_FOR_CHAIN_${d.chainId}>`);
        }
      }

      // graphman CLI syntax: graphman --config <CONFIG> rewind --block-hash <HASH> --block-number <NUM> <DEPLOYMENT>
      const commands = staleDeployments.map((d) => {
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
      let script = `#!/bin/bash\n# Auto-generated graphman rewind script for stale failures\n# Generated: ${new Date().toISOString()}\n# Incident: ${incident.id}\n#\n# ${staleDeployments.length} stale deployment(s) to rewind\n# ${genuineFailures.length} genuine failure(s) (not fixable by rewind)\n\nCONTAINER="${containerName}"\nSUCCESS=0\nFAILED=0\nFAILED_LIST=""\n`;

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
      const byChain = new Map<string, typeof staleDeployments>();
      for (const d of staleDeployments) {
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
          script += `\n# ${d.name}\necho "Rewinding ${d.hash.substring(0, 12)}... (${d.name}) to block ${rewindBlock}"\nif do_rewind "${rpcUrl}" ${rewindBlock} ${d.hash}; then\n  echo "  Done."\n  SUCCESS=$((SUCCESS + 1))\nelse\n  echo "  FAILED"\n  FAILED=$((FAILED + 1))\n  FAILED_LIST="$FAILED_LIST\\n  - ${d.name} (${d.hash.substring(0, 16)}...)"\nfi\n`;
        }
      }

      script += '\necho ""\necho "========================================"\necho "Results: $SUCCESS succeeded, $FAILED failed"\nif [ $FAILED -gt 0 ]; then\n  echo -e "\\nFailed deployments:$FAILED_LIST"\nfi\n';

      res.json({
        staleDeployments,
        genuineFailures,
        unknownDeployments,
        commands,
        script,
        containerName,
        totalFailed: subgraphs.length,
      });
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
