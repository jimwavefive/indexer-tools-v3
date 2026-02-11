import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useChainStore } from '../state/useChain';
import { useSettingsStore } from '../state/useSettings';
import { useGraphClient } from '../util/useGraphClient';
import { useNetwork } from './useNetwork';
import { useAccount } from './useAccount';
import { useDeploymentStatus } from './useDeploymentStatus';
import {
  GET_ALLOCATIONS,
  parseBigInt,
  weiToNumber,
  calculateApr,
  calculateAllocationDailyRewards,
  formatDuration,
} from '@indexer-tools/shared';
import type { NetworkState } from '@indexer-tools/shared';

// ---------- Raw GraphQL types ----------

interface RawAllocation {
  id: string;
  activeForIndexer: { id: string };
  subgraphDeployment: {
    versions: Array<{
      subgraph: {
        id: string;
        currentVersion?: {
          subgraphDeployment: { ipfsHash: string };
        };
        metadata: {
          image: string;
          displayName: string;
        };
      };
    }>;
    ipfsHash: string;
    createdAt: string;
    originalName: string;
    stakedTokens: string;
    indexingRewardAmount: string;
    signalledTokens: string;
    queryFeesAmount: string;
    deniedAt: string | null;
    manifest: { network: string };
  };
  allocatedTokens: string;
  effectiveAllocation: string;
  createdAt: string;
  createdAtEpoch: string;
  createdAtBlockHash: string;
  createdAtBlockNumber: string;
  indexingRewards: string;
  indexingIndexerRewards: string;
  indexingDelegatorRewards: string;
  isLegacy: boolean;
}

interface AllocationsResponse {
  allocations: RawAllocation[];
}

// ---------- Enriched type ----------

export interface EnrichedAllocationRow {
  id: string;
  isLegacy: boolean;
  displayName: string;
  ipfsHash: string;
  network: string;
  allocatedTokens: bigint;
  signalledTokens: bigint;
  stakedTokens: bigint;
  deniedAt: number | null;
  createdAt: number;
  createdAtEpoch: number;
  activeDuration: number;
  readableDuration: string;
  epochDuration: number;
  proportion: number;
  apr: number;
  dailyRewards: number;
  dailyRewardsCut: number;
  indexingRewardAmount: bigint;
  queryFeesAmount: bigint;
  subgraphId: string;
  currentVersionHash: string | null;
  healthStatus: string;
  healthColor: string;
}

// ---------- Enrichment ----------

function extractDisplayName(raw: RawAllocation): string {
  try {
    return (
      raw.subgraphDeployment.versions[0]?.subgraph?.metadata?.displayName ||
      raw.subgraphDeployment.ipfsHash.slice(0, 12)
    );
  } catch {
    return raw.subgraphDeployment.ipfsHash.slice(0, 12);
  }
}

export function enrichAllocations(
  raw: RawAllocation[],
  network: NetworkState | undefined,
  rewardCut: number,
): EnrichedAllocationRow[] {
  if (!network || raw.length === 0) return [];

  const networkData = {
    totalTokensSignalled: network.totalTokensSignalled,
    issuancePerYear: network.issuancePerYear,
    issuancePerBlock: network.issuancePerBlock,
  };
  const totalAllocatedNum = weiToNumber(network.totalTokensAllocated);
  const totalSignalledNum = weiToNumber(network.totalTokensSignalled);
  const currentEpoch = network.currentEpoch;
  const nowSec = Math.floor(Date.now() / 1000);

  const result: EnrichedAllocationRow[] = new Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
    const allo = raw[i];
    const dep = allo.subgraphDeployment;
    const signalled = parseBigInt(dep.signalledTokens);
    const staked = parseBigInt(dep.stakedTokens);
    const allocated = parseBigInt(allo.allocatedTokens);
    const signalNum = weiToNumber(signalled);
    const stakedNum = weiToNumber(staked);

    const createdAt = parseInt(allo.createdAt, 10);
    const createdAtEpoch = parseInt(allo.createdAtEpoch, 10);

    // Duration
    const activeDuration = nowSec - createdAt;
    const readableDuration = formatDuration(activeDuration);
    const epochDuration = currentEpoch - createdAtEpoch;

    // Proportion
    const proportion =
      stakedNum > 0 && totalSignalledNum > 0 && totalAllocatedNum > 0
        ? (signalNum / totalSignalledNum) / (stakedNum / totalAllocatedNum)
        : 0;

    // APR
    const apr = signalled > 0n ? calculateApr(signalled, staked, networkData) : 0;

    // Daily rewards
    const dailyRewards =
      signalled > 0n
        ? calculateAllocationDailyRewards(signalled, staked, allocated, networkData)
        : 0;

    // Daily rewards cut
    const dailyRewardsCut =
      rewardCut > 0 ? Math.round(dailyRewards * rewardCut / 1000000) : 0;

    // Subgraph metadata
    const version = dep.versions?.[0]?.subgraph;
    const subgraphId = version?.id || '';
    const currentVersionHash =
      version?.currentVersion?.subgraphDeployment?.ipfsHash || null;

    result[i] = {
      id: allo.id,
      isLegacy: allo.isLegacy,
      displayName: extractDisplayName(allo),
      ipfsHash: dep.ipfsHash,
      network: dep.manifest?.network || '',
      allocatedTokens: allocated,
      signalledTokens: signalled,
      stakedTokens: staked,
      deniedAt: dep.deniedAt ? parseInt(dep.deniedAt, 10) : null,
      createdAt,
      createdAtEpoch,
      activeDuration,
      readableDuration,
      epochDuration,
      proportion,
      apr,
      dailyRewards,
      dailyRewardsCut,
      indexingRewardAmount: parseBigInt(dep.indexingRewardAmount),
      queryFeesAmount: parseBigInt(dep.queryFeesAmount),
      subgraphId,
      currentVersionHash,
      healthStatus: '',
      healthColor: 'default',
    };
  }

  return result;
}

// ---------- Filtering ----------

export interface AllocationFilters {
  networkFilter: string[];
  activateBlacklist: boolean;
  blacklistSet: Set<string>;
  activateSynclist: boolean;
  synclistSet: Set<string>;
  minEpochDuration: number;
}

export function applyAllocationFilters(
  allocations: EnrichedAllocationRow[],
  filters: AllocationFilters,
): EnrichedAllocationRow[] {
  if (allocations.length === 0) return [];

  const {
    networkFilter,
    activateBlacklist,
    blacklistSet,
    activateSynclist,
    synclistSet,
    minEpochDuration,
  } = filters;

  const hasNetworkFilter = networkFilter.length > 0;
  const networkFilterSet = hasNetworkFilter ? new Set(networkFilter) : null;

  return allocations.filter((allo) => {
    if (hasNetworkFilter && (!allo.network || !networkFilterSet!.has(allo.network)))
      return false;
    if (activateBlacklist && blacklistSet.has(allo.ipfsHash)) return false;
    if (activateSynclist && !synclistSet.has(allo.ipfsHash)) return false;
    if (minEpochDuration > 0 && allo.epochDuration < minEpochDuration) return false;
    return true;
  });
}

// ---------- Data fetching ----------

async function fetchAllAllocations(
  client: ReturnType<typeof import('@indexer-tools/shared').createGraphClient>,
  indexerAddress: string,
): Promise<RawAllocation[]> {
  const allResults: RawAllocation[] = [];
  let skip = 0;

  while (true) {
    const data = await client.request<AllocationsResponse>(GET_ALLOCATIONS, {
      indexer: indexerAddress,
      skip,
    });
    allResults.push(...data.allocations);
    if (data.allocations.length < 1000) break;
    skip += 1000;
  }

  return allResults;
}

// ---------- Composable ----------

export interface AllocationTotals {
  count: number;
  dailyRewardsSum: number;
  dailyRewardsCutSum: number;
  avgApr: number;
  totalAllocatedStake: bigint;
}

export function useAllocations() {
  const chainStore = useChainStore();
  const settingsStore = useSettingsStore();
  const { networkClient } = useGraphClient();
  const { data: networkData } = useNetwork();
  const { data: accountData } = useAccount();
  const deploymentStatusQuery = useDeploymentStatus();

  const activeAccount = computed(() => settingsStore.getActiveAccount());

  const queryKey = computed(() => [
    'allocations',
    chainStore.activeChainId,
    activeAccount.value?.address ?? '',
  ]);

  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchAllAllocations(networkClient.value, activeAccount.value!.address),
    enabled: computed(() => !!activeAccount.value?.address),
    staleTime: 60_000,
  });

  // Enriched allocations (with deployment health status joined)
  const enriched = computed(() => {
    if (!query.data.value) return [];
    const rows = enrichAllocations(
      query.data.value,
      networkData.value,
      accountData.value?.rewardCut ?? 0,
    );

    // Join deployment health status
    const statuses = deploymentStatusQuery.data.value;
    if (statuses && statuses.length > 0) {
      const statusMap = new Map(statuses.map((s) => [s.subgraph, s]));
      for (const row of rows) {
        const ds = statusMap.get(row.ipfsHash);
        if (ds) {
          row.healthStatus = ds.statusLabel;
          row.healthColor = ds.statusColor;
        }
      }
    }

    return rows;
  });

  // Available networks for filter dropdown
  const availableNetworks = computed(() => {
    const nets = new Set<string>();
    for (const allo of enriched.value) {
      if (allo.network) nets.add(allo.network);
    }
    return [...nets].sort();
  });

  // Totals (matches v3 avgAPR formula: totalRewardsPerYear / (totalAllocated + availableStake))
  const totals = computed<AllocationTotals>(() => {
    const allos = enriched.value;
    const network = networkData.value;
    if (allos.length === 0 || !network) {
      return {
        count: 0,
        dailyRewardsSum: 0,
        dailyRewardsCutSum: 0,
        avgApr: 0,
        totalAllocatedStake: 0n,
      };
    }

    const totalSignalNum = weiToNumber(network.totalTokensSignalled);
    const issuancePerYearNum = weiToNumber(network.issuancePerYear);

    let totalRewardsPerYear = 0;
    let totalAllocated = 0n;
    let dailyRewardsSum = 0;
    let dailyRewardsCutSum = 0;

    for (const allo of allos) {
      totalAllocated += allo.allocatedTokens;
      if (!allo.deniedAt) {
        dailyRewardsSum += allo.dailyRewards;
        dailyRewardsCutSum += allo.dailyRewardsCut;

        if (allo.signalledTokens > 0n && allo.stakedTokens > 0n) {
          const signalNum = weiToNumber(allo.signalledTokens);
          const allocatedNum = weiToNumber(allo.allocatedTokens);
          const stakedNum = weiToNumber(allo.stakedTokens);
          totalRewardsPerYear +=
            (signalNum / totalSignalNum) * issuancePerYearNum * (allocatedNum / stakedNum);
        }
      }
    }

    const availableStake = accountData.value?.availableStake ?? 0n;
    const totalStakeGrt = weiToNumber(totalAllocated + availableStake);
    const avgApr =
      totalStakeGrt > 0 ? (totalRewardsPerYear / totalStakeGrt) * 100 : 0;

    return {
      count: allos.length,
      dailyRewardsSum,
      dailyRewardsCutSum,
      avgApr,
      totalAllocatedStake: totalAllocated,
    };
  });

  // Set of allocated deployment hashes (for SubgraphTable's "currently allocated" flag)
  const allocatedDeployments = computed(() => {
    const set = new Set<string>();
    for (const allo of enriched.value) {
      set.add(allo.ipfsHash);
    }
    return set;
  });

  return {
    ...query,
    enriched,
    availableNetworks,
    totals,
    allocatedDeployments,
  };
}
