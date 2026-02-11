import BigNumber from 'bignumber.js';
import type { Rule, RuleConfig, RuleContext, RuleResult, DeploymentStatus } from './Rule.js';
import type { Notification } from '../channels/Channel.js';

const WEI_PER_ETHER = new BigNumber(10).pow(18);
const MAX_LIST_ENTRIES = 15;

/** Failure category derived from graph-node deployment status */
export type FailureCategory = 'stale' | 'deterministic' | 'nondeterministic';

interface FailedDeployment {
  deploymentHash: string;
  displayName: string;
  allocatedGRT: BigNumber;
  errorMessage?: string;
  rewardsEligible: boolean;
  category: FailureCategory;
}

/**
 * Classify a failed deployment into a failure category.
 *
 * Priority: fatalError type first, then synced status.
 * - deterministic: code bug at specific block, will re-fail on rewind — NOT fixable
 * - nondeterministic: transient error — rewind MAY fix it
 * - stale: health=failed but NO fatalError and synced — just a stale status, fixable via rewind
 */
export function classifyFailure(status: DeploymentStatus): FailureCategory {
  if (status.fatalError) {
    return status.fatalError.deterministic ? 'deterministic' : 'nondeterministic';
  }
  // No fatal error but health=failed and synced — truly stale status
  if (status.synced) {
    return 'stale';
  }
  // No fatal error, not synced — shouldn't normally happen, treat as non-deterministic
  return 'nondeterministic';
}

/**
 * Collect all failed deployments with allocations from the rule context,
 * filtered by minGrt. Shared logic used by all 3 subtype rules.
 */
function collectFailedDeployments(
  context: RuleContext,
  minGrt: number,
): FailedDeployment[] {
  if (!context.deploymentStatuses) return [];

  const deploymentMap = new Map<string, FailedDeployment>();

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

      const category = classifyFailure(status);

      // Rewards eligibility: same logic as the wizard's "Closeable" filter.
      // A synced deployment can produce a valid POI for the current epoch,
      // even with a deterministic failure (it failed at a block past epoch start).
      const rewardsEligible = status.synced === true &&
        (!status.fatalError || status.fatalError.deterministic === true);

      deploymentMap.set(deploymentHash, {
        deploymentHash,
        displayName,
        allocatedGRT,
        errorMessage: status.fatalError?.message,
        rewardsEligible,
        category,
      });
    }
  }

  return [...deploymentMap.values()].filter(
    (d) => d.allocatedGRT.isGreaterThanOrEqualTo(minGrt),
  );
}

/**
 * Build a notification from a list of matching deployments.
 */
function buildNotification(
  ruleId: string,
  matching: FailedDeployment[],
  minGrt: number,
  label: string,
  severity: 'info' | 'warning' | 'critical',
): Notification {
  matching.sort((a, b) => b.allocatedGRT.minus(a.allocatedGRT).toNumber());

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
    rewardsEligible: d.rewardsEligible,
    category: d.category,
  }));

  return {
    title: `${matching.length} ${label} subgraph(s) with active allocations`,
    message,
    severity,
    timestamp: new Date().toISOString(),
    ruleId,
    metadata: {
      count: matching.length,
      minGrt,
      subgraphs: subgraphsMeta,
    },
  };
}

// ---------- Rule implementations ----------

/**
 * Stale failures: health=failed but synced to chainhead.
 * Fixable via graphman rewind (1 block back).
 */
export class FailedSubgraphStaleRule implements Rule {
  id: string;
  name: string;
  type = 'failed_subgraph_stale' as const;
  enabled: boolean;
  conditions: Record<string, unknown>;

  constructor(config: RuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.conditions = config.conditions;
  }

  evaluate(context: RuleContext): RuleResult {
    const minGrt = (this.conditions.minGrt as number) ?? 10000;
    const all = collectFailedDeployments(context, minGrt);
    const matching = all.filter((d) => d.category === 'stale');

    if (matching.length === 0) {
      return { triggered: false, notifications: [] };
    }

    return {
      triggered: true,
      notifications: [buildNotification(this.id, matching, minGrt, 'stale-failed', 'warning')],
    };
  }
}

/**
 * Deterministic failures: code bug at a specific block, will re-fail on rewind.
 * NOT fixable — requires subgraph author to publish a new version.
 */
export class FailedSubgraphDeterministicRule implements Rule {
  id: string;
  name: string;
  type = 'failed_subgraph_deterministic' as const;
  enabled: boolean;
  conditions: Record<string, unknown>;

  constructor(config: RuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.conditions = config.conditions;
  }

  evaluate(context: RuleContext): RuleResult {
    const minGrt = (this.conditions.minGrt as number) ?? 10000;
    const all = collectFailedDeployments(context, minGrt);
    const matching = all.filter((d) => d.category === 'deterministic');

    if (matching.length === 0) {
      return { triggered: false, notifications: [] };
    }

    return {
      triggered: true,
      notifications: [buildNotification(this.id, matching, minGrt, 'deterministic-failed', 'critical')],
    };
  }
}

/**
 * Non-deterministic failures: transient error while not synced.
 * Potentially fixable via rewind — the error may not reproduce on retry.
 */
export class FailedSubgraphNondeterministicRule implements Rule {
  id: string;
  name: string;
  type = 'failed_subgraph_nondeterministic' as const;
  enabled: boolean;
  conditions: Record<string, unknown>;

  constructor(config: RuleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.enabled = config.enabled;
    this.conditions = config.conditions;
  }

  evaluate(context: RuleContext): RuleResult {
    const minGrt = (this.conditions.minGrt as number) ?? 10000;
    const all = collectFailedDeployments(context, minGrt);
    const matching = all.filter((d) => d.category === 'nondeterministic');

    if (matching.length === 0) {
      return { triggered: false, notifications: [] };
    }

    return {
      triggered: true,
      notifications: [buildNotification(this.id, matching, minGrt, 'non-deterministic-failed', 'warning')],
    };
  }
}

/**
 * Legacy combined rule — kept for backwards compatibility.
 * Matches ALL failed subgraphs regardless of category.
 */
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
    const minGrt = (this.conditions.minGrt as number) ?? 10000;
    const matching = collectFailedDeployments(context, minGrt);

    if (matching.length === 0) {
      return { triggered: false, notifications: [] };
    }

    // Include rewards eligibility column in the legacy rule output
    matching.sort((a, b) => b.allocatedGRT.minus(a.allocatedGRT).toNumber());

    const shown = matching.slice(0, MAX_LIST_ENTRIES);
    const nameW = Math.max(4, ...shown.map((e) => e.displayName.length));
    const grtW = Math.max(3, ...shown.map((e) => e.allocatedGRT.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',').length));
    const rewardsW = 10;
    const hdr = `${'Name'.padEnd(nameW)}  ${'GRT'.padStart(grtW)}  ${'Rewards'.padStart(rewardsW)}`;
    const sep = '─'.repeat(hdr.length);
    const rows = shown.map((entry) => {
      const grt = entry.allocatedGRT.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const rewards = entry.rewardsEligible ? 'Eligible' : 'Ineligible';
      return `${entry.displayName.padEnd(nameW)}  ${grt.padStart(grtW)}  ${rewards.padStart(rewardsW)}`;
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
      rewardsEligible: d.rewardsEligible,
      category: d.category,
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
