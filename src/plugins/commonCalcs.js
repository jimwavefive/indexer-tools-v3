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
  let totalSignalProportion = new BigNumber(0);
  let totalFutureStaked = new BigNumber(0);

  for (let i = 0; i < selectedSubgraphs.length; i++) {
    const sub = selectedSubgraphs[i];
    if (sub.deployment.deniedAt || sub.deployment.signalledTokens == 0) continue;
    totalSignalProportion = totalSignalProportion.plus(
      new BigNumber(sub.deployment.signalledTokens).dividedBy(networkStore.getTotalTokensSignalled)
    );
    totalFutureStaked = totalFutureStaked.plus(futureStakedTokens[i].futureStakedTokens);
  }

  if (totalSignalProportion.isZero()) return new BigNumber(0);

  const reserveWei = new BigNumber(reserveGRT).multipliedBy(new BigNumber(10).pow(18));
  const denominator = new BigNumber(availableStakeWei)
    .plus(closingStakeWei)
    .minus(reserveWei)
    .plus(totalFutureStaked);

  if (denominator.isLessThanOrEqualTo(0)) return new BigNumber(0);

  return new BigNumber(100)
    .multipliedBy(networkStore.getIssuancePerYear)
    .multipliedBy(totalSignalProportion)
    .dividedBy(denominator);
}

export { maxAllo, calculateApr, calculateNewApr, calculateAllocationDailyRewards, calculateSubgraphDailyRewards, calculateReadableDuration, indexerCut, calculateAutoTargetApr };