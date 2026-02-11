import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useGraphClient } from '../util/useGraphClient';
import { useSettingsStore } from '../state/useSettings';
import { useChainStore } from '../state/useChain';

const LATEST_DAY_QUERY = `{
  queryDailyDataPoints(orderBy: dayNumber, first: 1, orderDirection: desc) {
    dayNumber
  }
}`;

const QOS_QUERY = `
  query queryDailyDataPoints($dayNumber: Int!, $indexer: String!) {
    indexer(id: $indexer) {
      id
      allocationDailyDataPoints(first: 1000, where: { dayNumber: $dayNumber }) {
        avg_indexer_blocks_behind
        dayNumber
        chain_id
        subgraph_deployment_ipfs_hash
        avg_indexer_latency_ms
        avg_query_fee
        id
        max_query_fee
        max_indexer_latency_ms
        max_indexer_blocks_behind
        num_indexer_200_responses
        proportion_indexer_200_responses
        query_count
        total_query_fees
      }
    }
  }
`;

export interface QosRow {
  avg_indexer_blocks_behind: number;
  dayNumber: number;
  chain_id: string;
  subgraph_deployment_ipfs_hash: string;
  avg_indexer_latency_ms: number;
  avg_query_fee: number;
  id: string;
  max_query_fee: number;
  max_indexer_latency_ms: number;
  max_indexer_blocks_behind: number;
  num_indexer_200_responses: number;
  proportion_indexer_200_responses: number;
  query_count: number;
  total_query_fees: number;
}

export function useQos() {
  const { qosClient } = useGraphClient();
  const settingsStore = useSettingsStore();
  const chainStore = useChainStore();

  const activeAddress = computed(
    () => settingsStore.getActiveAccount()?.address ?? '',
  );

  // QoS data is only available on arbitrum-one
  const isArbitrum = computed(() => chainStore.activeChainId === 'arbitrum-one');

  return useQuery({
    queryKey: computed(
      () => ['qos', chainStore.activeChainId, activeAddress.value] as const,
    ),
    queryFn: async (): Promise<QosRow[]> => {
      const client = qosClient.value;
      // Get latest day number (minus 1 for complete data)
      const dayData = await client.request<{
        queryDailyDataPoints: Array<{ dayNumber: number }>;
      }>(LATEST_DAY_QUERY);
      const dayNumber = (dayData.queryDailyDataPoints[0]?.dayNumber ?? 1) - 1;

      const data = await client.request<{
        indexer: { allocationDailyDataPoints: QosRow[] } | null;
      }>(QOS_QUERY, { dayNumber, indexer: activeAddress.value });

      return data.indexer?.allocationDailyDataPoints ?? [];
    },
    enabled: computed(() => isArbitrum.value && !!activeAddress.value),
    staleTime: 120_000,
  });
}
