import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useChainStore } from '../state/useChain';
import { useSettingsStore } from '../state/useSettings';
import { useGraphClient } from '../util/useGraphClient';
import { useNetwork } from './useNetwork';
import { useAccount } from './useAccount';
import { useDeploymentStatus } from './useDeploymentStatus';
import {
  GET_SUBGRAPHS,
  GET_SUBGRAPHS_NO_NETWORK_FILTER,
  parseBigInt,
  weiToNumber,
  toWei,
  calculateNewApr,
  calculateSubgraphDailyRewards,
  maxAllo,
} from '@indexer-tools/shared';
import type { NetworkState } from '@indexer-tools/shared';

// Raw shape from GraphQL
interface RawSubgraphManifest {
  id: string;
  deployment: {
    id: string;
    deniedAt: string | null;
    createdAt: string;
    indexingRewardAmount: string;
    ipfsHash: string;
    queryFeesAmount: string;
    signalledTokens: string;
    stakedTokens: string;
    manifest: {
      network: string | null;
      poweredBySubstreams: boolean;
    };
    versions: Array<{
      metadata: {
        subgraphVersion: {
          subgraph: {
            metadata: {
              displayName: string | null;
              image: string | null;
              description: string | null;
            };
          };
        };
      };
    }>;
  };
}

// Enriched subgraph for display
export interface EnrichedSubgraphRow {
  id: string;
  deploymentId: string;
  ipfsHash: string;
  displayName: string;
  network: string;
  createdAt: number;
  deniedAt: number | null;
  signalledTokens: bigint;
  stakedTokens: bigint;
  proportion: number;
  apr: number;
  newApr: number;
  dailyRewards: number;
  dailyRewardsCut: number;
  maxAllo: number;
  currentlyAllocated: boolean;
  poweredBySubstreams: boolean;
  healthStatus: string;
  healthColor: string;
  healthSynced: boolean | null;
  healthDeterministic: boolean | null;
  syncPercent: number | null;
}

interface SubgraphsResponse {
  subgraphDeploymentManifests: RawSubgraphManifest[];
}

function extractDisplayName(raw: RawSubgraphManifest): string {
  try {
    return (
      raw.deployment.versions[0]?.metadata?.subgraphVersion?.subgraph?.metadata?.displayName ||
      raw.deployment.ipfsHash.slice(0, 12)
    );
  } catch {
    return raw.deployment.ipfsHash.slice(0, 12);
  }
}

export function enrichSubgraphs(
  raw: RawSubgraphManifest[],
  network: NetworkState | undefined,
  rewardCut: number,
  newAllocationGrt: string,
  targetApr: string,
  showNewApr: boolean,
  allocatedDeployments: Set<string>,
): EnrichedSubgraphRow[] {
  if (!network || raw.length === 0) return [];

  const networkData = {
    totalTokensSignalled: network.totalTokensSignalled,
    issuancePerYear: network.issuancePerYear,
    issuancePerBlock: network.issuancePerBlock,
  };
  const totalAllocatedNum = weiToNumber(network.totalTokensAllocated);
  const totalSignalledNum = weiToNumber(network.totalTokensSignalled);
  const newAllocationWei = showNewApr ? toWei(newAllocationGrt || '0') : 0n;
  const targetAprNum = parseFloat(targetApr) || 10;

  const result: EnrichedSubgraphRow[] = new Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
    const sub = raw[i];
    const dep = sub.deployment;
    const signalled = parseBigInt(dep.signalledTokens);
    const staked = parseBigInt(dep.stakedTokens);
    const signalNum = weiToNumber(signalled);
    const stakedNum = weiToNumber(staked);

    // Proportion
    const proportion =
      stakedNum > 0 && totalSignalledNum > 0 && totalAllocatedNum > 0
        ? (signalNum / totalSignalledNum) / (stakedNum / totalAllocatedNum)
        : 0;

    // APR
    const apr = signalled > 0n ? calculateNewApr(signalled, staked, networkData, 0n) : 0;

    // New APR
    const newApr =
      showNewApr && signalled > 0n
        ? calculateNewApr(signalled, staked, networkData, newAllocationWei)
        : 0;

    // Daily rewards
    const dailyRewards =
      signalled > 0n
        ? calculateSubgraphDailyRewards(signalled, staked, networkData, newAllocationWei)
        : 0;

    // Daily rewards cut
    const dailyRewardsCut =
      rewardCut > 0 ? Math.round((dailyRewards * rewardCut) / 1000000) : 0;

    // Max allocation
    const maxAlloVal =
      signalled > 0n ? maxAllo(targetAprNum, signalled, networkData, staked) : 0;

    result[i] = {
      id: sub.id,
      deploymentId: dep.id,
      ipfsHash: dep.ipfsHash,
      displayName: extractDisplayName(sub),
      network: dep.manifest?.network || '',
      createdAt: parseInt(dep.createdAt, 10),
      deniedAt: dep.deniedAt ? parseInt(dep.deniedAt, 10) : null,
      signalledTokens: signalled,
      stakedTokens: staked,
      proportion,
      apr,
      newApr,
      dailyRewards,
      dailyRewardsCut,
      maxAllo: maxAlloVal,
      currentlyAllocated: allocatedDeployments.has(dep.ipfsHash),
      poweredBySubstreams: dep.manifest?.poweredBySubstreams || false,
      healthStatus: '',
      healthColor: 'default',
      healthSynced: null,
      healthDeterministic: null,
      syncPercent: null,
    };
  }

  return result;
}

export interface SubgraphFilters {
  search: string;
  minSignal: string;
  maxSignal: string;
  noRewardsFilter: number;
  networkFilter: string[];
  statusFilter: string;
  hideCurrentlyAllocated: boolean;
  hideZeroApr: boolean;
  activateBlacklist: boolean;
  blacklistSet: Set<string>;
  activateSynclist: boolean;
  synclistSet: Set<string>;
}

export function applySubgraphFilters(
  subgraphs: EnrichedSubgraphRow[],
  filters: SubgraphFilters,
): EnrichedSubgraphRow[] {
  if (subgraphs.length === 0) return [];

  const {
    search,
    minSignal,
    maxSignal,
    noRewardsFilter,
    networkFilter,
    hideCurrentlyAllocated,
    hideZeroApr,
    activateBlacklist,
    blacklistSet,
    activateSynclist,
    synclistSet,
  } = filters;

  const hasNetworkFilter = networkFilter.length > 0;
  const networkFilterSet = hasNetworkFilter ? new Set(networkFilter) : null;

  const minSignalWei = minSignal ? toWei(minSignal) : null;
  const maxSignalWei = maxSignal ? toWei(maxSignal) : null;

  const searchLower = search.toLowerCase();
  const hasSearch = searchLower.length > 0;

  return subgraphs.filter((item) => {
    // Search
    if (hasSearch) {
      if (
        !item.displayName.toLowerCase().includes(searchLower) &&
        !item.ipfsHash.toLowerCase().includes(searchLower) &&
        !item.network.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    // Denied filter
    if (noRewardsFilter === 0 && item.deniedAt) return false;
    if (noRewardsFilter === 2 && !item.deniedAt) return false;

    // Network filter
    if (hasNetworkFilter && (!item.network || !networkFilterSet!.has(item.network))) return false;

    // Blacklist
    if (activateBlacklist && blacklistSet.has(item.ipfsHash)) return false;

    // Synclist
    if (activateSynclist && !synclistSet.has(item.ipfsHash)) return false;

    // Signal range
    if (minSignalWei && item.signalledTokens < minSignalWei) return false;
    if (maxSignalWei && item.signalledTokens > maxSignalWei) return false;

    // Hide currently allocated
    if (hideCurrentlyAllocated && item.currentlyAllocated) return false;

    // Hide zero APR
    if (hideZeroApr && item.apr <= 0) return false;

    return true;
  });
}

async function fetchAllSubgraphs(
  client: ReturnType<typeof import('@indexer-tools/shared').createGraphClient>,
  networkFilter: string[],
  minSignal: string,
): Promise<RawSubgraphManifest[]> {
  const hasNetworkFilter = networkFilter.length > 0;
  const query = hasNetworkFilter ? GET_SUBGRAPHS : GET_SUBGRAPHS_NO_NETWORK_FILTER;
  const allResults: RawSubgraphManifest[] = [];
  let cursor = '0';

  while (true) {
    const variables: Record<string, unknown> = {
      cursor,
      minSignal: toWei(minSignal || '0').toString(),
    };
    if (hasNetworkFilter) {
      variables.networks = networkFilter;
    }

    const data = await client.request<SubgraphsResponse>(query, variables);
    const batch = data.subgraphDeploymentManifests;
    allResults.push(...batch);

    if (batch.length < 1000) break;
    cursor = batch[batch.length - 1].id;
  }

  return allResults;
}

export function useSubgraphs(indexerChains?: Ref<string[]>, allocatedDeployments?: Ref<Set<string>>) {
  const chainStore = useChainStore();
  const settingsStore = useSettingsStore();
  const { networkClient } = useGraphClient();
  const { data: networkData } = useNetwork();
  const { data: accountData } = useAccount();
  const deploymentStatusQuery = useDeploymentStatus();

  // When "Limit to indexer's chains" is enabled, use chains from active allocations
  // for the GQL query filter; otherwise fall back to the manual network filter
  const effectiveNetworkFilter = computed(() => {
    if (settingsStore.state.limitToIndexerChains && indexerChains?.value?.length) {
      return indexerChains.value;
    }
    return settingsStore.state.networkFilter;
  });

  const queryKey = computed(() => [
    'subgraphs',
    chainStore.activeChainId,
    effectiveNetworkFilter.value.join(','),
  ]);

  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchAllSubgraphs(
        networkClient.value,
        effectiveNetworkFilter.value,
        '0', // minSignal for the GraphQL query -- we filter client-side
      ),
    staleTime: 120_000, // 2 minutes
  });

  // Column visibility determines if newApr should be computed
  const showNewApr = computed(() =>
    settingsStore.state.subgraphColumns.some((c) => c.id === 'newApr' && c.visible),
  );

  // Enriched subgraphs (computed from raw query data + network + account)
  const enriched = computed(() => {
    if (!query.data.value) return [];
    const rows = enrichSubgraphs(
      query.data.value,
      networkData.value,
      accountData.value?.rewardCut ?? 0,
      settingsStore.state.newAllocation,
      settingsStore.state.targetApr,
      showNewApr.value,
      allocatedDeployments?.value ?? new Set<string>(),
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
          row.healthSynced = ds.synced;
          row.healthDeterministic = ds.fatalError?.deterministic ?? null;
          row.syncPercent = ds.syncPercent;
        }
      }
    }

    return rows;
  });

  // Build filter params
  const filterParams = computed<SubgraphFilters>(() => ({
    search: settingsStore.state.search,
    minSignal: settingsStore.state.minSignal,
    maxSignal: settingsStore.state.maxSignal,
    noRewardsFilter: settingsStore.state.noRewardsFilter,
    networkFilter: settingsStore.state.networkFilter,
    statusFilter: settingsStore.state.statusFilter,
    hideCurrentlyAllocated: settingsStore.state.hideCurrentlyAllocated,
    hideZeroApr: settingsStore.state.hideZeroApr,
    activateBlacklist: settingsStore.state.activateBlacklist,
    blacklistSet: new Set(settingsStore.getCombinedBlacklist()),
    activateSynclist: settingsStore.state.activateSynclist,
    synclistSet: new Set(
      settingsStore.state.subgraphSynclist
        ? settingsStore.state.subgraphSynclist
            .split('\n')
            .map((l: string) => l.trim())
            .filter(Boolean)
        : [],
    ),
  }));

  // Filtered subgraphs
  const filtered = computed(() => applySubgraphFilters(enriched.value, filterParams.value));

  // Unique networks for network filter dropdown
  const availableNetworks = computed(() => {
    if (!query.data.value) return [];
    const nets = new Set<string>();
    for (const sub of query.data.value) {
      const net = sub.deployment.manifest?.network;
      if (net) nets.add(net);
    }
    return [...nets].sort();
  });

  return {
    ...query,
    enriched,
    filtered,
    availableNetworks,
  };
}
