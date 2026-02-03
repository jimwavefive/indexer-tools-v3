import BigNumber from 'bignumber.js';
import type { Allocation } from '@indexer-tools/shared';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

const WEI_PER_ETHER = new BigNumber(10).pow(18);
const BLOCKS_PER_YEAR = 6450 * 365;

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
    const maxApr = (this.conditions.maxApr as number) ?? 0;
    const minGrt = (this.conditions.minGrt as number) ?? 10000;
    const notifications: Notification[] = [];
    let totalUpgrades = 0;

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

      // Sum allocated GRT across all allocations for this subgraph
      const totalAllocatedWei = allocations.reduce(
        (sum, a) => sum.plus(a.allocatedTokens),
        new BigNumber(0),
      );
      const totalAllocatedGRT = totalAllocatedWei.dividedBy(WEI_PER_ETHER);

      // Calculate current APR: signal/totalSignal * issuancePerYear / stakedTokens * 100
      const deployment = allocations[0].subgraphDeployment;
      const issuancePerYear = new BigNumber(context.networkData.networkGRTIssuancePerBlock).multipliedBy(BLOCKS_PER_YEAR);
      let aprPct = new BigNumber(0);
      if (new BigNumber(deployment.stakedTokens).isGreaterThan(0) && new BigNumber(context.networkData.totalTokensSignalled).isGreaterThan(0)) {
        aprPct = new BigNumber(deployment.signalledTokens)
          .dividedBy(context.networkData.totalTokensSignalled)
          .multipliedBy(issuancePerYear)
          .dividedBy(deployment.stakedTokens)
          .multipliedBy(100);
      }

      totalUpgrades++;

      // Filter: only alert when APR is low enough and GRT is high enough to matter
      if (aprPct.isGreaterThan(maxApr) || totalAllocatedGRT.isLessThan(minGrt)) continue;

      notifications.push({
        title: `Subgraph deployment upgraded`,
        message: `**${displayName}** has a new deployment (${latestDeploymentHash.slice(0, 12)}...) but your ${allocations.length} allocation(s) are on older version(s) with **${totalAllocatedGRT.toFixed(0)} GRT** allocated at **${aprPct.toFixed(1)}% APR**. You may need to re-allocate.`,
        severity: 'info',
        timestamp: new Date().toISOString(),
        ruleId: this.id,
        metadata: {
          subgraphId,
          latestDeploymentHash,
          currentDeploymentHashes: currentHashes,
          allocatedGRT: totalAllocatedGRT.toFixed(0),
          apr: aprPct.toFixed(1),
        },
      });
    }

    const filteredCount = totalUpgrades - notifications.length;
    const filterSummary =
      notifications.length === 0 && filteredCount > 0
        ? `${filteredCount} upgrade(s) found but none match filters (APR <= ${maxApr}% and GRT >= ${minGrt.toLocaleString('en-US')})`
        : undefined;

    return {
      triggered: notifications.length > 0,
      notifications,
      filterSummary,
    };
  }
}
