import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useChainStore } from '../state/useChain';
import { useSettingsStore } from '../state/useSettings';
import { useGraphClient } from '../util/useGraphClient';
import { parseBigInt } from '@indexer-tools/shared';

const GET_INDEXER = `
  query indexer($indexer: String!) {
    indexer(id: $indexer) {
      indexingRewardCut
      availableStake
      url
    }
  }
`;

interface IndexerResponse {
  indexer: {
    indexingRewardCut: string;
    availableStake: string;
    url: string;
  } | null;
}

export interface AccountData {
  rewardCut: number; // parts per million
  availableStake: bigint;
  url: string;
}

export function useAccount() {
  const chainStore = useChainStore();
  const settingsStore = useSettingsStore();
  const { networkClient } = useGraphClient();

  const activeAccount = computed(() => settingsStore.getActiveAccount());

  const queryKey = computed(() => [
    'account',
    chainStore.activeChainId,
    activeAccount.value?.address ?? '',
  ]);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<AccountData> => {
      const address = activeAccount.value?.address;
      if (!address) {
        return { rewardCut: 0, availableStake: 0n, url: '' };
      }
      const data = await networkClient.value.request<IndexerResponse>(GET_INDEXER, {
        indexer: address,
      });
      if (!data.indexer) {
        return { rewardCut: 0, availableStake: 0n, url: '' };
      }
      return {
        rewardCut: parseInt(data.indexer.indexingRewardCut, 10),
        availableStake: parseBigInt(data.indexer.availableStake),
        url: data.indexer.url,
      };
    },
    enabled: computed(() => !!activeAccount.value?.address),
    staleTime: 60_000,
  });
}
