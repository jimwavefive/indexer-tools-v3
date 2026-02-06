import BigNumber from 'bignumber.js';
import type { Allocation } from '@indexer-tools/shared';
import type { Rule, RuleConfig, RuleContext, RuleResult } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

const WEI_PER_ETHER = new BigNumber(10).pow(18);
const BLOCKS_PER_YEAR = 6450 * 365;
const MAX_LIST_ENTRIES = 20;

interface AllocationCandidate {
  allocationId: string;
  deploymentHash: string;
  name: string;
  allocatedGRT: BigNumber;
  apr: BigNumber;
  isLegacy: boolean;
}

export class NegativeStakeRule implements Rule {
  id: string;
  name: string;
  type = 'negative_stake' as const;
  enabled: boolean;
  conditions: Record<string, unknown>;

  constructor(config: RuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.conditions = config.conditions;
  }

  evaluate(context: RuleContext): RuleResult {
    if (!context.indexer) {
      return { triggered: false, notifications: [] };
    }

    const availableStake = new BigNumber(context.indexer.availableStake);

    // Not negative — no issue
    if (availableStake.isGreaterThanOrEqualTo(0)) {
      return { triggered: false, notifications: [] };
    }

    const bufferGRT = (this.conditions.bufferGRT as number) ?? 1;
    const shortfall = availableStake.abs().dividedBy(WEI_PER_ETHER);
    const target = shortfall.plus(bufferGRT);

    // Calculate APR for each allocation
    const issuancePerYear = new BigNumber(context.networkData.networkGRTIssuancePerBlock)
      .multipliedBy(BLOCKS_PER_YEAR);

    const candidates: AllocationCandidate[] = [];

    for (const allocation of context.allocations) {
      const deployment = allocation.subgraphDeployment;
      const allocatedGRT = new BigNumber(allocation.allocatedTokens).dividedBy(WEI_PER_ETHER);

      let apr = new BigNumber(0);
      if (
        new BigNumber(deployment.stakedTokens).isGreaterThan(0) &&
        new BigNumber(context.networkData.totalTokensSignalled).isGreaterThan(0)
      ) {
        apr = new BigNumber(deployment.signalledTokens)
          .dividedBy(context.networkData.totalTokensSignalled)
          .multipliedBy(issuancePerYear)
          .dividedBy(deployment.stakedTokens)
          .multipliedBy(100);
      }

      const displayName =
        deployment.versions?.[0]?.subgraph?.metadata?.displayName ||
        deployment.originalName ||
        deployment.ipfsHash.slice(0, 12) + '...';

      candidates.push({
        allocationId: allocation.id,
        deploymentHash: deployment.ipfsHash,
        name: displayName,
        allocatedGRT,
        apr,
        isLegacy: allocation.isLegacy,
      });
    }

    // Sort: APR ascending (cheapest first), then GRT descending (larger first for fewer closes)
    candidates.sort((a, b) => {
      const aprDiff = a.apr.minus(b.apr).toNumber();
      if (aprDiff !== 0) return aprDiff;
      return b.allocatedGRT.minus(a.allocatedGRT).toNumber();
    });

    // Greedily pick allocations until we cover the shortfall target
    const toClose: AllocationCandidate[] = [];
    let cumulative = new BigNumber(0);

    for (const candidate of candidates) {
      if (cumulative.isGreaterThanOrEqualTo(target)) break;
      toClose.push(candidate);
      cumulative = cumulative.plus(candidate.allocatedGRT);
    }

    // Build notification message as ASCII table
    const shown = toClose.slice(0, MAX_LIST_ENTRIES);
    const nameW = Math.max(4, ...shown.map((e) => e.name.length));
    const grtW = Math.max(3, ...shown.map((e) => e.allocatedGRT.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',').length));
    const aprW = Math.max(3, ...shown.map((e) => e.apr.toFixed(1).length + 1)); // +1 for %

    const hdr = `${'Name'.padEnd(nameW)}  ${'GRT'.padStart(grtW)}  ${'APR'.padStart(aprW)}`;
    const sep = '─'.repeat(hdr.length);
    const rows = shown.map((entry) => {
      const grt = entry.allocatedGRT.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const aprStr = entry.apr.toFixed(1) + '%';
      return `${entry.name.padEnd(nameW)}  ${grt.padStart(grtW)}  ${aprStr.padStart(aprW)}`;
    });

    let message = `Available stake is **${shortfall.toFixed(0)} GRT negative**. Close these ${toClose.length} allocation(s) (lowest APR first) to recover:\n`;
    message += '```\n' + hdr + '\n' + sep + '\n' + rows.join('\n') + '\n```';
    if (toClose.length > MAX_LIST_ENTRIES) {
      message += `\n*...and ${toClose.length - MAX_LIST_ENTRIES} more*`;
    }

    const allocationsToClose = toClose.map((c) => ({
      allocationId: c.allocationId,
      deploymentHash: c.deploymentHash,
      name: c.name,
      allocatedGRT: c.allocatedGRT.toFixed(0),
      apr: c.apr.toFixed(1),
      isLegacy: c.isLegacy,
    }));

    const notification: Notification = {
      title: `Negative available stake: ${shortfall.toFixed(0)} GRT over capacity`,
      message,
      severity: 'critical',
      timestamp: new Date().toISOString(),
      ruleId: this.id,
      metadata: {
        shortfallGRT: shortfall.toFixed(0),
        targetGRT: target.toFixed(0),
        availableStakeGRT: availableStake.dividedBy(WEI_PER_ETHER).toFixed(0),
        allocationsToClose,
        totalCloseGRT: cumulative.toFixed(0),
      },
    };

    return {
      triggered: true,
      notifications: [notification],
    };
  }
}
