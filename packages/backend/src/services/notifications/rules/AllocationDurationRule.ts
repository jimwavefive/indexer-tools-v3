import type { Allocation } from '@indexer-tools/shared';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

const DEFAULT_THRESHOLD_EPOCHS = 26;

export class AllocationDurationRule implements Rule {
  id: string;
  name: string;
  type = 'allocation_duration' as const;
  enabled: boolean;
  conditions: Record<string, unknown>;

  constructor(config: RuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.conditions = config.conditions;
  }

  evaluate(context: RuleContext): RuleResult {
    const thresholdEpochs = (this.conditions.thresholdEpochs as number) ?? DEFAULT_THRESHOLD_EPOCHS;
    const currentEpoch = context.networkData.currentEpoch;
    const notifications: Notification[] = [];

    for (const allocation of context.allocations) {
      const epochDuration = currentEpoch - allocation.createdAtEpoch;

      if (epochDuration >= thresholdEpochs) {
        const displayName = getAllocationDisplayName(allocation);
        notifications.push({
          title: `Allocation nearing max duration`,
          message: `Allocation on **${displayName}** (${allocation.subgraphDeployment.ipfsHash.slice(0, 12)}...) has been open for **${epochDuration} epochs** (threshold: ${thresholdEpochs}). Close and re-allocate soon.`,
          severity: 'critical',
          timestamp: new Date().toISOString(),
          ruleId: this.id,
          metadata: {
            allocationId: allocation.id,
            deploymentIpfsHash: allocation.subgraphDeployment.ipfsHash,
            epochDuration,
            thresholdEpochs,
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
