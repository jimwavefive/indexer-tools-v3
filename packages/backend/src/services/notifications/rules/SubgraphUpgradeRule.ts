import type { Allocation } from '@indexer-tools/shared';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

export class SubgraphUpgradeRule implements Rule {
  id: string;
  name: string;
  type = 'subgraph_upgrade' as const;
  enabled: boolean;
  conditions: Record<string, unknown>;

  constructor(config: RuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.conditions = config.conditions;
  }

  evaluate(context: RuleContext): RuleResult {
    const notifications: Notification[] = [];

    // Group allocations by parent subgraph ID
    const subgraphAllocations = new Map<
      string,
      { subgraph: Allocation['subgraphDeployment']['versions'][0]['subgraph']; allocations: Allocation[] }
    >();

    for (const allocation of context.allocations) {
      const versions = allocation.subgraphDeployment.versions;
      if (versions.length === 0) continue;

      const subgraphId = versions[0].subgraph.id;
      let entry = subgraphAllocations.get(subgraphId);
      if (!entry) {
        entry = { subgraph: versions[0].subgraph, allocations: [] };
        subgraphAllocations.set(subgraphId, entry);
      }
      entry.allocations.push(allocation);
    }

    // For each subgraph, check if any allocation is on the latest deployment
    for (const [subgraphId, { subgraph, allocations }] of subgraphAllocations) {
      const latestDeploymentHash = subgraph.currentVersion?.subgraphDeployment?.ipfsHash;
      if (!latestDeploymentHash) continue;

      const hasLatest = allocations.some(
        (a) => a.subgraphDeployment.ipfsHash === latestDeploymentHash,
      );

      if (hasLatest) continue;

      // None of the indexer's allocations are on the latest deployment
      const displayName =
        subgraph.metadata?.displayName ||
        allocations[0].subgraphDeployment.originalName ||
        subgraphId;

      const currentHashes = [...new Set(allocations.map((a) => a.subgraphDeployment.ipfsHash))];

      notifications.push({
        title: `Subgraph deployment upgraded`,
        message: `**${displayName}** has a new deployment (${latestDeploymentHash.slice(0, 12)}...) but your ${allocations.length} allocation(s) are on older version(s). You may need to re-allocate.`,
        severity: 'info',
        timestamp: new Date().toISOString(),
        ruleId: this.id,
        metadata: {
          subgraphId,
          latestDeploymentHash,
          currentDeploymentHashes: currentHashes,
        },
      });
    }

    return {
      triggered: notifications.length > 0,
      notifications,
    };
  }
}
