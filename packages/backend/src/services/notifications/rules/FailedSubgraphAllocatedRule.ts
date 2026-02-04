import BigNumber from 'bignumber.js';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

const WEI_PER_ETHER = new BigNumber(10).pow(18);
const MAX_LIST_ENTRIES = 15;

export class FailedSubgraphAllocatedRule implements Rule {
  id: string;
  name: string;
  type = 'failed_subgraph' as const;
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

    const minGrt = (this.conditions.minGrt as number) ?? 10000;

    // Deduplicate by deployment hash, summing GRT across allocations
    const deploymentMap = new Map<string, {
      deploymentHash: string;
      displayName: string;
      allocatedGRT: BigNumber;
      errorMessage?: string;
    }>();

    for (const allocation of context.allocations) {
      const deploymentHash = allocation.subgraphDeployment.ipfsHash;
      const status = context.deploymentStatuses.get(deploymentHash);

      if (!status || status.health !== 'failed') continue;

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
          errorMessage: status.fatalError?.message,
        });
      }
    }

    // Filter by minGrt
    const matching = [...deploymentMap.values()].filter(
      (d) => d.allocatedGRT.isGreaterThanOrEqualTo(minGrt),
    );

    if (matching.length === 0) {
      return { triggered: false, notifications: [] };
    }

    // Sort by GRT descending
    matching.sort((a, b) => b.allocatedGRT.minus(a.allocatedGRT).toNumber());

    // Build code block table
    const shown = matching.slice(0, MAX_LIST_ENTRIES);
    const nameW = Math.max(4, ...shown.map((e) => e.displayName.length));
    const grtW = Math.max(3, ...shown.map((e) => e.allocatedGRT.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',').length));

    const hdr = `${'Name'.padEnd(nameW)}  ${'GRT'.padStart(grtW)}`;
    const sep = '─'.repeat(hdr.length);
    const rows = shown.map((entry) => {
      const grt = entry.allocatedGRT.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return `${entry.displayName.padEnd(nameW)}  ${grt.padStart(grtW)}`;
    });

    let message = '```\n' + hdr + '\n' + sep + '\n' + rows.join('\n') + '\n```';
    if (matching.length > MAX_LIST_ENTRIES) {
      message += `\n*...and ${matching.length - MAX_LIST_ENTRIES} more*`;
    }

    const subgraphsMeta = matching.map((d) => ({
      name: d.displayName,
      deploymentHash: d.deploymentHash,
      allocatedGRT: d.allocatedGRT.toFixed(0),
      errorMessage: d.errorMessage,
    }));

    const notification: Notification = {
      title: `${matching.length} failed subgraph(s) with active allocations`,
      message,
      severity: 'warning',
      timestamp: new Date().toISOString(),
      ruleId: this.id,
      metadata: {
        count: matching.length,
        minGrt,
        subgraphs: subgraphsMeta,
      },
    };

    return {
      triggered: true,
      notifications: [notification],
    };
  }
}
