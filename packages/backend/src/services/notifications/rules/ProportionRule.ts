import type { Allocation } from '@indexer-tools/shared';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

const DEFAULT_THRESHOLD = 0.5;

export class ProportionRule implements Rule {
  id: string;
  name: string;
  type = 'proportion' as const;
  enabled: boolean;
  conditions: Record<string, unknown>;

  constructor(config: RuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.conditions = config.conditions;
  }

  evaluate(context: RuleContext): RuleResult {
    const threshold = (this.conditions.threshold as number) ?? DEFAULT_THRESHOLD;
    const totalSignal = Number(context.networkData.totalTokensSignalled);
    const totalStake = Number(context.networkData.totalTokensAllocated);
    const notifications: Notification[] = [];

    if (totalSignal === 0 || totalStake === 0) {
      return { triggered: false, notifications: [] };
    }

    for (const allocation of context.allocations) {
      const signal = Number(allocation.subgraphDeployment.signalledTokens || '0');
      const stake = Number(allocation.allocatedTokens || '0');

      if (signal === 0 || stake === 0) continue;

      const signalProportion = signal / totalSignal;
      const stakeProportion = stake / totalStake;
      const ratio = signalProportion / stakeProportion;

      if (ratio < threshold) {
        const displayName = getAllocationDisplayName(allocation);
        notifications.push({
          title: `Disproportionate allocation`,
          message: `Allocation on **${displayName}** (${allocation.subgraphDeployment.ipfsHash.slice(0, 12)}...) has a signal/stake proportion ratio of ${ratio.toFixed(3)}, which is below the threshold of ${threshold}. This allocation may be over-staked relative to its signal.`,
          severity: 'warning',
          timestamp: new Date().toISOString(),
          ruleId: this.id,
          metadata: {
            allocationId: allocation.id,
            subgraphName: displayName,
            deploymentIpfsHash: allocation.subgraphDeployment.ipfsHash,
            ratio: ratio.toFixed(4),
            threshold,
            signalProportion: signalProportion.toFixed(6),
            stakeProportion: stakeProportion.toFixed(6),
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

function getAllocationDisplayName(allocation: Allocation): string {
  const versions = allocation.subgraphDeployment.versions;
  if (versions.length > 0 && versions[0].subgraph.metadata?.displayName) {
    return versions[0].subgraph.metadata.displayName;
  }
  return allocation.subgraphDeployment.originalName || allocation.subgraphDeployment.ipfsHash;
}
