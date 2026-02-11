import { computed } from 'vue';
import { createGraphClient } from '@indexer-tools/shared';
import type { ChainId } from '@indexer-tools/shared';
import { useChainStore } from '../state/useChain';
import { getSubgraphUrl, getQosSubgraphUrl } from '../../plugins/defaults';

export function useGraphClient() {
  const chainStore = useChainStore();

  const networkClient = computed(() => {
    return createGraphClient(getSubgraphUrl(chainStore.activeChainId));
  });

  function getNetworkClientForChain(chainId: ChainId) {
    return createGraphClient(getSubgraphUrl(chainId));
  }

  const qosClient = computed(() => {
    return createGraphClient(getQosSubgraphUrl());
  });

  return { networkClient, getNetworkClientForChain, qosClient };
}
