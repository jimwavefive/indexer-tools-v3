import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChainId } from '@indexer-tools/shared';
import { CHAIN_CONFIGS } from '@indexer-tools/shared';

export const useChainStore = defineStore('chain', () => {
  const activeChainId = ref<ChainId>(
    (localStorage.getItem('activeChainId') as ChainId) || 'arbitrum-one',
  );

  const rpcOverrides = ref<Partial<Record<ChainId, string>>>(
    JSON.parse(localStorage.getItem('rpcOverrides') || '{}'),
  );

  const activeChainConfig = computed(() => CHAIN_CONFIGS[activeChainId.value]);

  function setActiveChain(chainId: ChainId) {
    activeChainId.value = chainId;
    localStorage.setItem('activeChainId', chainId);
  }

  function setRpcOverride(chainId: ChainId, url: string) {
    rpcOverrides.value = { ...rpcOverrides.value, [chainId]: url };
    localStorage.setItem('rpcOverrides', JSON.stringify(rpcOverrides.value));
  }

  function clearRpcOverride(chainId: ChainId) {
    const { [chainId]: _, ...rest } = rpcOverrides.value;
    rpcOverrides.value = rest;
    localStorage.setItem('rpcOverrides', JSON.stringify(rpcOverrides.value));
  }

  return {
    activeChainId,
    activeChainConfig,
    rpcOverrides,
    setActiveChain,
    setRpcOverride,
    clearRpcOverride,
  };
});
