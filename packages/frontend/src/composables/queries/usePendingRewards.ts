import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useChainStore } from '../state/useChain';
import { useSettingsStore } from '../state/useSettings';
import { useViem } from '../util/useViem';
import { CHAIN_CONFIGS } from '@indexer-tools/shared';
import type { ChainId } from '@indexer-tools/shared';

// Minimal ABI for the getRewards view function
const REWARDS_ABI = [
  {
    inputs: [
      { name: '_rewardsIssuer', type: 'address' },
      { name: '_allocationID', type: 'address' },
    ],
    name: 'getRewards',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Subgraph service addresses per chain (non-legacy allocations)
// Legacy allocations use the staking contract from CHAIN_CONFIGS
const SUBGRAPH_SERVICE: Partial<Record<ChainId, `0x${string}`>> = {
  'arbitrum-one': '0xb2Bb92d0DE618878E438b55D5846cfecD9301105',
};

function getIssuer(isLegacy: boolean, chainId: ChainId): `0x${string}` {
  if (isLegacy) {
    return CHAIN_CONFIGS[chainId].stakingContractAddress as `0x${string}`;
  }
  return SUBGRAPH_SERVICE[chainId] ?? CHAIN_CONFIGS[chainId].stakingContractAddress as `0x${string}`;
}

export interface AllocationForRewards {
  id: string;
  isLegacy: boolean;
}

/**
 * Fetches pending rewards for all allocations via a single viem multicall.
 *
 * Returns a Record<allocationId, bigint> mapping allocation IDs to their pending rewards.
 * Enabled automatically when `automaticIndexingRewards` is on, or manually via `refetch()`.
 */
export function usePendingRewards(
  allocations: Ref<AllocationForRewards[]>,
) {
  const chainStore = useChainStore();
  const settingsStore = useSettingsStore();
  const { client } = useViem();

  const allocIds = computed(() =>
    allocations.value.map((a) => a.id).join(','),
  );

  const queryKey = computed(() => [
    'pendingRewards',
    chainStore.activeChainId,
    allocIds.value,
  ]);

  // Auto-fetch when setting is enabled and allocations are loaded
  const autoEnabled = computed(
    () =>
      settingsStore.state.automaticIndexingRewards &&
      allocations.value.length > 0,
  );

  return useQuery({
    queryKey,
    queryFn: async (): Promise<Record<string, bigint>> => {
      const chainId = chainStore.activeChainId;
      const rewardsAddress = CHAIN_CONFIGS[chainId]
        .rewardsContractAddress as `0x${string}`;
      const allos = allocations.value;

      if (allos.length === 0) return {};

      const contracts = allos.map((a) => ({
        address: rewardsAddress,
        abi: REWARDS_ABI,
        functionName: 'getRewards' as const,
        args: [getIssuer(a.isLegacy, chainId), a.id as `0x${string}`] as const,
      }));

      const results = await client.value.multicall({
        contracts,
        allowFailure: true,
      });

      const map: Record<string, bigint> = {};
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'success') {
          map[allos[i].id] = result.result as bigint;
        }
      }
      return map;
    },
    enabled: autoEnabled,
    staleTime: 120_000,
  });
}
