import BigNumber from 'bignumber.js';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

const WEI_PER_ETHER = new BigNumber(10).pow(18);
const MAX_LIST_ENTRIES = 15;

export class BehindChainheadAllocatedRule implements Rule {
  id: string;
  name: string;
  type = 'behind_chainhead' as const;
  enabled: boolean;
  conditions: Record<string, unknown>;

  constructor(config: RuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.conditions = config.conditions;
  }

  evaluate(context: RuleContext): RuleResult {
    if (!context.deploymentStatuses) {
      return { triggered: false, notifications: [] };
    }

    const blocksBehindThreshold = (this.conditions.blocksBehindThreshold as number) ?? 5000;

    // Deduplicate by deployment hash, summing GRT across allocations
    const deploymentMap = new Map<string, {
      deploymentHash: string;
      displayName: string;
      allocatedGRT: BigNumber;
      blocksBehind: number;
    }>();

    for (const allocation of context.allocations) {
      const deploymentHash = allocation.subgraphDeployment.ipfsHash;
      const status = context.deploymentStatuses.get(deploymentHash);

      if (!status || !status.chains || status.chains.length === 0) continue;

      // Use the first chain's block numbers
      const chain = status.chains[0];
      const chainHead = parseInt(chain.chainHeadBlock?.number || '0', 10);
      const latestBlock = parseInt(chain.latestBlock?.number || '0', 10);
      const blocksBehind = chainHead - latestBlock;

      if (blocksBehind < blocksBehindThreshold) continue;

      const allocatedWei = new BigNumber(allocation.allocatedTokens);
      const allocatedGRT = allocatedWei.dividedBy(WEI_PER_ETHER);

      const existing = deploymentMap.get(deploymentHash);
      if (existing) {
        existing.allocatedGRT = existing.allocatedGRT.plus(allocatedGRT);
      } else {
        const displayName =
          allocation.subgraphDeployment.versions?.[0]?.subgraph?.metadata?.displayName ||
          allocation.subgraphDeployment.originalName ||
          deploymentHash.slice(0, 12) + '...';

        deploymentMap.set(deploymentHash, {
          deploymentHash,
          displayName,
          allocatedGRT,
          blocksBehind,
        });
      }
    }

    const matching = [...deploymentMap.values()];

    if (matching.length === 0) {
      return { triggered: false, notifications: [] };
    }

    // Sort by GRT descending
    matching.sort((a, b) => b.allocatedGRT.minus(a.allocatedGRT).toNumber());

    // Build code block table
    const shown = matching.slice(0, MAX_LIST_ENTRIES);
    const nameW = Math.max(4, ...shown.map((e) => e.displayName.length));
    const grtW = Math.max(3, ...shown.map((e) => e.allocatedGRT.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',').length));
    const behindW = Math.max(6, ...shown.map((e) => e.blocksBehind.toLocaleString('en-US').length));

    const hdr = `${'Name'.padEnd(nameW)}  ${'GRT'.padStart(grtW)}  ${'Behind'.padStart(behindW)}`;
    const sep = '─'.repeat(hdr.length);
    const rows = shown.map((entry) => {
      const grt = entry.allocatedGRT.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const behind = entry.blocksBehind.toLocaleString('en-US');
      return `${entry.displayName.padEnd(nameW)}  ${grt.padStart(grtW)}  ${behind.padStart(behindW)}`;
    });

    let message = '```\n' + hdr + '\n' + sep + '\n' + rows.join('\n') + '\n```';
    if (matching.length > MAX_LIST_ENTRIES) {
      message += `\n*...and ${matching.length - MAX_LIST_ENTRIES} more*`;
    }

    const subgraphsMeta = matching.map((d) => ({
      name: d.displayName,
      deploymentHash: d.deploymentHash,
      blocksBehind: d.blocksBehind,
      allocatedGRT: d.allocatedGRT.toFixed(0),
    }));

    const notification: Notification = {
      title: `${matching.length} subgraph(s) behind chainhead with active allocations`,
      message,
      severity: 'warning',
      timestamp: new Date().toISOString(),
      ruleId: this.id,
      metadata: {
        count: matching.length,
        blocksBehindThreshold,
        subgraphs: subgraphsMeta,
      },
    };

    return {
      triggered: true,
      notifications: [notification],
    };
  }
}
