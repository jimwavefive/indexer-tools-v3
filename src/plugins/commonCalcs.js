import BigNumber from "bignumber.js";
import { toWei } from "@/plugins/web3Utils";

BigNumber.config({ POW_PRECISION: 1000 });

function maxAllo(target_apr_dec, signalledTokens, networkStore, stakedTokens){
  let target_apr = new BigNumber(target_apr_dec).dividedBy(100);

  // signalledTokens / totalTokensSignalled * issuancePerYear / apr - stakedTokens = maxAllocation
  try{
    return new BigNumber(signalledTokens)
        .dividedBy(networkStore.getTotalTokensSignalled)
        .multipliedBy(networkStore.getIssuancePerYear)
        .dividedBy(target_apr)
        .minus(stakedTokens)
        .dividedBy(new BigNumber(10).pow(18));
  }catch(e){
    return new BigNumber(0);
  }
}

function calculateApr(currentSignalledTokens, stakedTokens, networkStore){
  return calculateNewApr(currentSignalledTokens, stakedTokens, networkStore, "0");
}

function calculateNewApr(currentSignalledTokens, stakedTokens, networkStore, newAllocation){
  if(new BigNumber(stakedTokens).plus(newAllocation) <= new BigNumber(0))
    return new BigNumber(0);
  
  try{
    // signalledTokens / totalTokensSignalled * issuancePerYear / (stakedTokens + newAllocation)
    return new BigNumber(currentSignalledTokens)
          .dividedBy(networkStore.getTotalTokensSignalled)
          .multipliedBy(networkStore.getIssuancePerYear)
          .dividedBy(
              new BigNumber(stakedTokens).plus(toWei(newAllocation))
          ).multipliedBy(100);
  }
  catch(e){
    return new BigNumber(0);
  }
}

function calculateAllocationDailyRewards(signalledTokens, stakedTokens, allocatedTokens, networkStore){
  if(new BigNumber(stakedTokens) <= new BigNumber(0))
    return new BigNumber(0);

  try{
    // signalledTokens / totalTokensSignalled * issuancePerBlock * blocks per day * (allocatedTokens / stakedTokens))
      return new BigNumber(signalledTokens)
          .dividedBy(networkStore.getTotalTokensSignalled)
          .multipliedBy(networkStore.getIssuancePerBlock)
          .multipliedBy(6450)
          .multipliedBy(allocatedTokens)
          .dividedBy(stakedTokens)
          .dp(0);
  }
  catch(e){
    return new BigNumber(0);
  }
}

function calculateSubgraphDailyRewards(currentSignalledTokens, stakedTokens, networkStore, newAllocation){
  if(new BigNumber(stakedTokens) <= new BigNumber(0))
    return new BigNumber(0);

  try{
    return new BigNumber(currentSignalledTokens)
        .dividedBy(networkStore.getTotalTokensSignalled)
        .multipliedBy(networkStore.getIssuancePerBlock)
        .multipliedBy(6450)
        .multipliedBy(
            new BigNumber(toWei(newAllocation)).dividedBy(new BigNumber(stakedTokens).plus(toWei(newAllocation)))
        ).dp(0);
  }
  catch(e){
    return new BigNumber(0);
  }
  
}

function calculateReadableDuration(seconds) {
  seconds = Number(seconds);
  let d = Math.floor(seconds / (3600*24));
  let h = Math.floor(seconds % (3600*24) / 3600);
  let m = Math.floor(seconds % 3600 / 60);
  return `${d}d ${h}h ${m}m`;
}

function indexerCut(rewards, rewardCut){
  let afterCut = new BigNumber(rewards).multipliedBy(rewardCut).dividedBy(1000000).dp(0,1);
  return afterCut;
}

function calculateAutoTargetApr(selectedSubgraphs, futureStakedTokens, networkStore, availableStakeWei, closingStakeWei, reserveGRT = '1') {
  const reserveWei = new BigNumber(reserveGRT).multipliedBy(new BigNumber(10).pow(18));

  // Build initial eligible set (non-denied, has signal)
  let eligible = [];
  for (let i = 0; i < selectedSubgraphs.length; i++) {
    const sub = selectedSubgraphs[i];
    if (sub.deployment.deniedAt || sub.deployment.signalledTokens == 0) continue;
    eligible.push({ sub, i });
  }

  // Iteratively exclude subgraphs that would have negative maxAllo at the
  // computed APR. Without this, setAllMaxAllos skips negative-maxAllo
  // subgraphs but the positive ones over-allocate to compensate.
  while (eligible.length > 0) {
    let totalSignalProportion = new BigNumber(0);
    let totalFutureStaked = new BigNumber(0);

    for (const { sub, i } of eligible) {
      totalSignalProportion = totalSignalProportion.plus(
        new BigNumber(sub.deployment.signalledTokens).dividedBy(networkStore.getTotalTokensSignalled)
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
      .multipliedBy(networkStore.getIssuancePerYear)
      .multipliedBy(totalSignalProportion)
      .dividedBy(denominator);

    const targetApr = apr.dividedBy(100);

    // Check which subgraphs would have negative maxAllo at this APR
    let needsRemoval = false;
    let newEligible = [];
    for (const item of eligible) {
      const { sub, i } = item;
      const computedMaxAllo = new BigNumber(sub.deployment.signalledTokens)
        .dividedBy(networkStore.getTotalTokensSignalled)
        .multipliedBy(networkStore.getIssuancePerYear)
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

export { maxAllo, calculateApr, calculateNewApr, calculateAllocationDailyRewards, calculateSubgraphDailyRewards, calculateReadableDuration, indexerCut, calculateAutoTargetApr };