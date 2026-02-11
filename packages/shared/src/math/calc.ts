/**
 * Financial calculations for The Graph protocol.
 *
 * Pattern: Token amounts use bigint (wei), ratios/percentages use number.
 * All functions are pure — no side effects or store dependencies.
 */

import { weiToNumber, WEI_PER_ETHER } from './wei.js';

export interface NetworkData {
  totalTokensSignalled: bigint;
  issuancePerYear: bigint;
  issuancePerBlock: bigint;
}

/**
 * Maximum allocation for a target APR.
 * Returns GRT (not wei) as a number for display.
 */
export function maxAllo(
  targetAprPercent: number,
  signalledTokens: bigint,
  network: NetworkData,
  stakedTokens: bigint,
): number {
  if (targetAprPercent <= 0 || network.totalTokensSignalled === 0n) return 0;

  const targetAprDec = targetAprPercent / 100;
  const signal = weiToNumber(signalledTokens);
  const totalSignal = weiToNumber(network.totalTokensSignalled);
  const issuance = weiToNumber(network.issuancePerYear);
  const staked = weiToNumber(stakedTokens);

  const result = (signal / totalSignal) * issuance / targetAprDec - staked;
  return result > 0 ? result : 0;
}

/**
 * Current APR for a subgraph deployment (no additional allocation).
 */
export function calculateApr(
  signalledTokens: bigint,
  stakedTokens: bigint,
  network: NetworkData,
): number {
  return calculateNewApr(signalledTokens, stakedTokens, network, 0n);
}

/**
 * APR after adding a new allocation.
 * newAllocationWei is the allocation amount in wei.
 */
export function calculateNewApr(
  signalledTokens: bigint,
  stakedTokens: bigint,
  network: NetworkData,
  newAllocationWei: bigint,
): number {
  const totalStaked = stakedTokens + newAllocationWei;
  if (totalStaked <= 0n || network.totalTokensSignalled === 0n) return 0;

  const signal = weiToNumber(signalledTokens);
  const totalSignal = weiToNumber(network.totalTokensSignalled);
  const issuance = weiToNumber(network.issuancePerYear);
  const staked = weiToNumber(totalStaked);

  return (signal / totalSignal) * issuance / staked * 100;
}

/**
 * Daily rewards for a specific allocation (allocated tokens known).
 */
export function calculateAllocationDailyRewards(
  signalledTokens: bigint,
  stakedTokens: bigint,
  allocatedTokens: bigint,
  network: NetworkData,
): number {
  if (stakedTokens <= 0n || network.totalTokensSignalled === 0n) return 0;

  const signal = weiToNumber(signalledTokens);
  const totalSignal = weiToNumber(network.totalTokensSignalled);
  const issuancePerBlock = weiToNumber(network.issuancePerBlock);
  const allocated = weiToNumber(allocatedTokens);
  const staked = weiToNumber(stakedTokens);

  // 6450 blocks per day (Ethereum ~13.2s blocks)
  return Math.round(signal / totalSignal * issuancePerBlock * 6450 * allocated / staked);
}

/**
 * Daily rewards for a subgraph with a hypothetical new allocation.
 */
export function calculateSubgraphDailyRewards(
  signalledTokens: bigint,
  stakedTokens: bigint,
  network: NetworkData,
  newAllocationWei: bigint,
): number {
  const totalStaked = stakedTokens + newAllocationWei;
  if (totalStaked <= 0n || network.totalTokensSignalled === 0n) return 0;

  const signal = weiToNumber(signalledTokens);
  const totalSignal = weiToNumber(network.totalTokensSignalled);
  const issuancePerBlock = weiToNumber(network.issuancePerBlock);
  const alloc = weiToNumber(newAllocationWei);
  const staked = weiToNumber(totalStaked);

  return Math.round(signal / totalSignal * issuancePerBlock * 6450 * alloc / staked);
}

/**
 * Indexer cut from rewards based on reward cut (parts per million).
 */
export function indexerCut(rewardsWei: bigint, rewardCut: number): bigint {
  return rewardsWei * BigInt(rewardCut) / 1000000n;
}

export interface SelectedSubgraph {
  deployment: {
    deniedAt: number | null;
    signalledTokens: bigint;
  };
}

export interface FutureStakedEntry {
  futureStakedTokens: bigint;
}

/**
 * Auto-target APR calculation.
 *
 * Iteratively finds the optimal APR that distributes available stake
 * across eligible subgraphs proportionally, removing subgraphs where
 * the computed max allocation is negative (over-allocated).
 *
 * Returns APR as a percentage (e.g. 15.5 for 15.5%).
 */
export function calculateAutoTargetApr(
  selectedSubgraphs: SelectedSubgraph[],
  futureStakedTokens: FutureStakedEntry[],
  network: NetworkData,
  availableStakeWei: bigint,
  closingStakeWei: bigint,
  reserveGrt: number = 1,
): number {
  if (network.totalTokensSignalled === 0n) return 0;

  const reserveWei = BigInt(Math.round(reserveGrt * 1e18));
  const totalSignal = weiToNumber(network.totalTokensSignalled);
  const issuance = weiToNumber(network.issuancePerYear);

  let eligible: { sub: SelectedSubgraph; i: number }[] = [];
  for (let i = 0; i < selectedSubgraphs.length; i++) {
    const sub = selectedSubgraphs[i];
    if (sub.deployment.deniedAt || sub.deployment.signalledTokens === 0n) continue;
    eligible.push({ sub, i });
  }

  while (eligible.length > 0) {
    let totalSignalProportion = 0;
    let totalFutureStaked = 0n;

    for (const { sub, i } of eligible) {
      totalSignalProportion += weiToNumber(sub.deployment.signalledTokens) / totalSignal;
      totalFutureStaked += futureStakedTokens[i].futureStakedTokens;
    }

    if (totalSignalProportion === 0) return 0;

    const denominator = weiToNumber(availableStakeWei + closingStakeWei - reserveWei + totalFutureStaked);
    if (denominator <= 0) return 0;

    const apr = 100 * issuance * totalSignalProportion / denominator;
    const targetAprDec = apr / 100;

    let needsRemoval = false;
    const newEligible: typeof eligible = [];
    for (const item of eligible) {
      const { sub, i } = item;
      const signal = weiToNumber(sub.deployment.signalledTokens);
      const futureStaked = weiToNumber(futureStakedTokens[i].futureStakedTokens);
      const computedMaxAllo = (signal / totalSignal) * issuance / targetAprDec - futureStaked;

      if (computedMaxAllo > 0) {
        newEligible.push(item);
      } else {
        needsRemoval = true;
      }
    }

    if (!needsRemoval) return apr;
    if (newEligible.length === 0) return 0;

    eligible = newEligible;
  }

  return 0;
}
