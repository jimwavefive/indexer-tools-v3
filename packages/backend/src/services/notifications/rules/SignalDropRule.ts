import type { Allocation } from '@indexer-tools/shared';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

export class SignalDropRule implements Rule {
  id: string;
  name: string;
  type = 'signal_drop' as const;
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

    for (const allocation of context.allocations) {
      const signalledTokens = BigInt(allocation.subgraphDeployment.signalledTokens || '0');

      if (signalledTokens === 0n) {
        const displayName = getAllocationDisplayName(allocation);
        notifications.push({
          title: `Signal dropped to zero`,
          message: `Allocation on **${displayName}** (${allocation.subgraphDeployment.ipfsHash.slice(0, 12)}...) has zero signalled tokens. This subgraph may no longer be earning indexing rewards.`,
          severity: 'warning',
          timestamp: new Date().toISOString(),
          ruleId: this.id,
          metadata: {
            allocationId: allocation.id,
            subgraphName: displayName,
            deploymentIpfsHash: allocation.subgraphDeployment.ipfsHash,
            allocatedGRT: weiToGrt(allocation.allocatedTokens),
            signalledTokens: allocation.subgraphDeployment.signalledTokens,
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

function weiToGrt(wei: string): string {
  return (Number(wei) / 1e18).toFixed(0);
}

function getAllocationDisplayName(allocation: Allocation): string {
  const versions = allocation.subgraphDeployment.versions;
  if (versions.length > 0 && versions[0].subgraph.metadata?.displayName) {
    return versions[0].subgraph.metadata.displayName;
  }
  return allocation.subgraphDeployment.originalName || allocation.subgraphDeployment.ipfsHash;
}
