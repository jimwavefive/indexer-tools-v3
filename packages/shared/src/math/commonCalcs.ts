import BigNumber from 'bignumber.js';
import { toWei } from './web3Utils';

BigNumber.config({ POW_PRECISION: 1000 });

const WEI_PER_ETHER = new BigNumber(10).pow(18);

export interface NetworkData {
  getTotalTokensSignalled: string;
  getIssuancePerYear: string | number;
  getIssuancePerBlock: string | number;
}

export function maxAllo(
  target_apr_dec: string | number,
  signalledTokens: string | number,
  networkData: NetworkData,
  stakedTokens: string | number,
): BigNumber {
  const target_apr = new BigNumber(target_apr_dec).dividedBy(100);

  try {
    return new BigNumber(signalledTokens)
      .dividedBy(networkData.getTotalTokensSignalled)
      .multipliedBy(networkData.getIssuancePerYear)
      .dividedBy(target_apr)
      .minus(stakedTokens)
      .dividedBy(WEI_PER_ETHER);
  } catch {
    return new BigNumber(0);
  }
}

export function calculateApr(
  currentSignalledTokens: string | number,
  stakedTokens: string | number,
  networkData: NetworkData,
): BigNumber {
  return calculateNewApr(currentSignalledTokens, stakedTokens, networkData, '0');
}

export function calculateNewApr(
  currentSignalledTokens: string | number,
  stakedTokens: string | number | BigNumber,
  networkData: NetworkData,
  newAllocation: string | number,
  newAllocationWei?: string | null,
): BigNumber {
  const allocWei = newAllocationWei != null ? newAllocationWei : toWei(newAllocation);
  if (new BigNumber(stakedTokens).plus(allocWei).isLessThanOrEqualTo(0)) {
    return new BigNumber(0);
  }

  try {
    return new BigNumber(currentSignalledTokens)
      .dividedBy(networkData.getTotalTokensSignalled)
      .multipliedBy(networkData.getIssuancePerYear)
      .dividedBy(new BigNumber(stakedTokens).plus(allocWei))
      .multipliedBy(100);
  } catch {
    return new BigNumber(0);
  }
}

export function calculateAllocationDailyRewards(
  signalledTokens: string | number,
  stakedTokens: string | number,
  allocatedTokens: string | number,
  networkData: NetworkData,
): BigNumber {
  if (new BigNumber(stakedTokens).isLessThanOrEqualTo(0)) {
    return new BigNumber(0);
  }

  try {
    return new BigNumber(signalledTokens)
      .dividedBy(networkData.getTotalTokensSignalled)
      .multipliedBy(networkData.getIssuancePerBlock)
      .multipliedBy(6450)
      .multipliedBy(allocatedTokens)
      .dividedBy(stakedTokens)
      .dp(0);
  } catch {
    return new BigNumber(0);
  }
}

export function calculateSubgraphDailyRewards(
  currentSignalledTokens: string | number,
  stakedTokens: string | number | BigNumber,
  networkData: NetworkData,
  newAllocation: string | number,
  newAllocationWei?: string | null,
): BigNumber {
  if (new BigNumber(stakedTokens).isLessThanOrEqualTo(0)) {
    return new BigNumber(0);
  }

  const allocWei = newAllocationWei != null ? newAllocationWei : toWei(newAllocation);
  try {
    return new BigNumber(currentSignalledTokens)
      .dividedBy(networkData.getTotalTokensSignalled)
      .multipliedBy(networkData.getIssuancePerBlock)
      .multipliedBy(6450)
      .multipliedBy(new BigNumber(allocWei).dividedBy(new BigNumber(stakedTokens).plus(allocWei)))
      .dp(0);
  } catch {
    return new BigNumber(0);
  }
}

export function calculateReadableDuration(seconds: number): string {
  seconds = Number(seconds);
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export function indexerCut(rewards: BigNumber | string | number, rewardCut: number): BigNumber {
  return new BigNumber(rewards).multipliedBy(rewardCut).dividedBy(1000000).dp(0, 1);
}

export interface SelectedSubgraph {
  deployment: {
    deniedAt: number | null;
    signalledTokens: string | number;
  };
}

export interface FutureStakedEntry {
  futureStakedTokens: string | number | BigNumber;
}

export function calculateAutoTargetApr(
  selectedSubgraphs: SelectedSubgraph[],
  futureStakedTokens: FutureStakedEntry[],
  networkData: NetworkData,
  availableStakeWei: string | number | BigNumber,
  closingStakeWei: string | number | BigNumber,
  reserveGRT: string = '1',
): BigNumber {
  const reserveWei = new BigNumber(reserveGRT).multipliedBy(WEI_PER_ETHER);

  let eligible: { sub: SelectedSubgraph; i: number }[] = [];
  for (let i = 0; i < selectedSubgraphs.length; i++) {
    const sub = selectedSubgraphs[i];
    if (sub.deployment.deniedAt || sub.deployment.signalledTokens == 0) continue;
    eligible.push({ sub, i });
  }

  while (eligible.length > 0) {
    let totalSignalProportion = new BigNumber(0);
    let totalFutureStaked = new BigNumber(0);

    for (const { sub, i } of eligible) {
      totalSignalProportion = totalSignalProportion.plus(
        new BigNumber(sub.deployment.signalledTokens).dividedBy(networkData.getTotalTokensSignalled),
      );
      totalFutureStaked = totalFutureStaked.plus(futureStakedTokens[i].futureStakedTokens);
    }

    if (totalSignalProportion.isZero()) return new BigNumber(0);

    const denominator = new BigNumber(availableStakeWei)
      .plus(closingStakeWei)
      .minus(reserveWei)
      .plus(totalFutureStaked);

    if (denominator.isLessThanOrEqualTo(0)) return new BigNumber(0);

    const apr = new BigNumber(100)
      .multipliedBy(networkData.getIssuancePerYear)
      .multipliedBy(totalSignalProportion)
      .dividedBy(denominator);

    const targetApr = apr.dividedBy(100);

    let needsRemoval = false;
    const newEligible: typeof eligible = [];
    for (const item of eligible) {
      const { sub, i } = item;
      const computedMaxAllo = new BigNumber(sub.deployment.signalledTokens)
        .dividedBy(networkData.getTotalTokensSignalled)
        .multipliedBy(networkData.getIssuancePerYear)
        .dividedBy(targetApr)
        .minus(futureStakedTokens[i].futureStakedTokens);

      if (computedMaxAllo.isGreaterThan(0)) {
        newEligible.push(item);
      } else {
        needsRemoval = true;
      }
    }

    if (!needsRemoval) return apr;
    if (newEligible.length === 0) return new BigNumber(0);

    eligible = newEligible;
  }

  return new BigNumber(0);
}
