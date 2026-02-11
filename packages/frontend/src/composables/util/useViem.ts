import { computed } from 'vue';
import { createPublicClient, http, type Chain } from 'viem';
import { mainnet, arbitrum, sepolia, arbitrumSepolia } from 'viem/chains';
import type { ChainId } from '@indexer-tools/shared';
import { useChainStore } from '../state/useChain';
import { useRuntimeConfig } from '../../plugins/defaults';

const VIEM_CHAINS: Record<ChainId, Chain> = {
  'mainnet': mainnet,
  'arbitrum-one': arbitrum,
  'sepolia': sepolia,
  'arbitrum-sepolia': arbitrumSepolia,
};

export function useViem() {
  const chainStore = useChainStore();
  const runtimeConfig = useRuntimeConfig();

  const client = computed(() => {
    const chainId = chainStore.activeChainId;
    const chain = VIEM_CHAINS[chainId];

    // Priority: user RPC override > runtime config default > chain default
    const rpcUrl =
      chainStore.rpcOverrides[chainId] ||
      runtimeConfig.rpcDefaults[chainId] ||
      undefined;

    return createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  });

  function getClientForChain(chainId: ChainId) {
    const chain = VIEM_CHAINS[chainId];
    const rpcUrl =
      chainStore.rpcOverrides[chainId] ||
      runtimeConfig.rpcDefaults[chainId] ||
      undefined;

    return createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  }

  return { client, getClientForChain };
}
