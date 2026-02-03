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
    const previousDeploymentHashes = context.previousState.deploymentHashes;

    for (const allocation of context.allocations) {
      const versions = allocation.subgraphDeployment.versions;
      if (versions.length === 0) continue;

      const subgraphId = versions[0].subgraph.id;
      const currentDeploymentHash = allocation.subgraphDeployment.ipfsHash;
      const previousHash = previousDeploymentHashes.get(subgraphId);

      // Only trigger if we had a previous hash and it changed
      if (previousHash && previousHash !== currentDeploymentHash) {
        const displayName =
          versions[0].subgraph.metadata?.displayName ||
          allocation.subgraphDeployment.originalName ||
          subgraphId;

        notifications.push({
          title: `Subgraph deployment upgraded`,
          message: `**${displayName}** has a new deployment. Previous: ${previousHash.slice(0, 12)}..., Current: ${currentDeploymentHash.slice(0, 12)}... You may need to re-allocate.`,
          severity: 'info',
          timestamp: new Date().toISOString(),
          ruleId: this.id,
          metadata: {
            subgraphId,
            allocationId: allocation.id,
            previousDeploymentHash: previousHash,
            currentDeploymentHash,
          },
        });
      }
    }

    return {
      triggered: notifications.length > 0,
      notifications,
    };
  }
}
