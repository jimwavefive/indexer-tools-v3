import BigNumber from 'bignumber.js';
import type { Allocation, Notification } from '@indexer-tools/shared';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';

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
    const maxApr = (this.conditions.maxApr as number) ?? 10;
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

    const issuancePerYear = new BigNumber(context.networkData.networkGRTIssuancePerBlock).multipliedBy(BLOCKS_PER_YEAR);

    // For each subgraph, check each old deployment independently
    for (const [subgraphId, { subgraph, allocations }] of subgraphAllocations) {
      const latestDeploymentHash = subgraph.currentVersion?.subgraphDeployment?.ipfsHash;
      if (!latestDeploymentHash) continue;

      const displayName =
        subgraph.metadata?.displayName ||
        allocations[0].subgraphDeployment.originalName ||
        subgraphId;

      // Group allocations by deployment hash within this subgraph
      const byDeployment = new Map<string, Allocation[]>();
      for (const a of allocations) {
        const hash = a.subgraphDeployment.ipfsHash;
        if (hash === latestDeploymentHash) continue; // skip allocations already on latest
        let list = byDeployment.get(hash);
        if (!list) {
          list = [];
          byDeployment.set(hash, list);
        }
        list.push(a);
      }

      if (byDeployment.size === 0) continue; // all allocations are on latest

      // Evaluate each old deployment independently
      for (const [deploymentHash, depAllocations] of byDeployment) {
        const deployment = depAllocations[0].subgraphDeployment;

        const allocatedWei = depAllocations.reduce(
          (sum, a) => sum.plus(a.allocatedTokens),
          new BigNumber(0),
        );
        const allocatedGRT = allocatedWei.dividedBy(WEI_PER_ETHER);

        // Calculate APR for this specific deployment
        let aprPct = new BigNumber(0);
        if (new BigNumber(deployment.stakedTokens).isGreaterThan(0) && new BigNumber(context.networkData.totalTokensSignalled).isGreaterThan(0)) {
          aprPct = new BigNumber(deployment.signalledTokens)
            .dividedBy(context.networkData.totalTokensSignalled)
            .multipliedBy(issuancePerYear)
            .dividedBy(deployment.stakedTokens)
            .multipliedBy(100);
        }

        totalUpgrades++;

        // Filter: only alert when GRT is high enough to matter
        if (allocatedGRT.isLessThan(minGrt)) continue;
        // Filter: only alert when APR is low enough (0 = disabled, alert regardless of APR)
        if (maxApr > 0 && aprPct.isGreaterThan(maxApr)) continue;

        notifications.push({
          title: `Subgraph deployment upgraded`,
          message: `**${displayName}** has a new deployment (${latestDeploymentHash.slice(0, 12)}...) but your ${depAllocations.length} allocation(s) on ${deploymentHash.slice(0, 12)}... have **${allocatedGRT.toFixed(0)} GRT** at **${aprPct.toFixed(1)}% APR**. You may need to re-allocate.`,
          severity: 'info',
          timestamp: new Date().toISOString(),
          ruleId: this.id,
          metadata: {
            subgraphId,
            subgraphName: displayName,
            latestDeploymentHash,
            currentDeploymentHash: deploymentHash,
            allocatedGRT: allocatedGRT.toFixed(0),
            apr: aprPct.toFixed(1),
          },
        });
      }
    }

    const filteredCount = totalUpgrades - notifications.length;
    const aprDesc = maxApr > 0 ? `APR <= ${maxApr}%` : 'any APR';
    const filterSummary =
      notifications.length === 0 && filteredCount > 0
        ? `${filteredCount} upgrade(s) found but none match filters (${aprDesc} and GRT >= ${minGrt.toLocaleString('en-US')})`
        : undefined;

    return {
      triggered: notifications.length > 0,
      notifications,
      filterSummary,
    };
  }
}
