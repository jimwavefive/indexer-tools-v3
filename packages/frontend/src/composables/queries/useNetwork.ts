import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useChainStore } from '../state/useChain';
import { useGraphClient } from '../util/useGraphClient';
import { parseBigInt, CHAIN_CONFIGS } from '@indexer-tools/shared';
import type { NetworkState, ChainId } from '@indexer-tools/shared';
import { GET_GRAPH_NETWORK } from '@indexer-tools/shared';

interface GraphNetworkResponse {
  graphNetwork: {
    totalTokensSignalled: string;
    networkGRTIssuancePerBlock: string;
    totalSupply: string;
    currentEpoch: string;
    totalTokensAllocated: string;
    maxThawingPeriod: string;
  };
}

function parseNetworkState(raw: GraphNetworkResponse['graphNetwork'], chainId: ChainId): NetworkState {
  const blocksPerYear = CHAIN_CONFIGS[chainId].blocksPerDay * 365;
  const issuancePerBlock = parseBigInt(raw.networkGRTIssuancePerBlock);
  return {
    totalTokensSignalled: parseBigInt(raw.totalTokensSignalled),
    issuancePerBlock,
    issuancePerYear: issuancePerBlock * BigInt(blocksPerYear),
    totalSupply: parseBigInt(raw.totalSupply),
    currentEpoch: parseInt(raw.currentEpoch, 10),
    totalTokensAllocated: parseBigInt(raw.totalTokensAllocated),
    maxThawingPeriod: parseInt(raw.maxThawingPeriod || '0', 10),
    error: false,
  };
}

export function useNetwork() {
  const chainStore = useChainStore();
  const { networkClient } = useGraphClient();

  const queryKey = computed(() => ['network', chainStore.activeChainId]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const data = await networkClient.value.request<GraphNetworkResponse>(GET_GRAPH_NETWORK);
      return parseNetworkState(data.graphNetwork, chainStore.activeChainId);
    },
    staleTime: 60_000, // 1 minute
  });
}
