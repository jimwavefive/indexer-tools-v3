import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useGraphClient } from '../util/useGraphClient';

const LATEST_DAY_QUERY = `{
  queryDailyDataPoints(orderBy: dayNumber, first: 1, orderDirection: desc) {
    dayNumber
  }
}`;

const QUERY_FEES_QUERY = `
  query queryDailyDataPoints($dayNumber: Int!) {
    queryDailyDataPoints(
      orderBy: total_query_fees
      where: { dayNumber: $dayNumber }
      orderDirection: desc
      first: 1000
    ) {
      dayNumber
      chain_id
      avg_query_fee
      avg_gateway_latency_ms
      gateway_query_success_rate
      query_count
      total_query_fees
      subgraphDeployment { id }
    }
  }
`;

export interface QueryFeeRow {
  dayNumber: number;
  chain_id: string;
  avg_query_fee: number;
  avg_gateway_latency_ms: number;
  gateway_query_success_rate: number;
  query_count: number;
  total_query_fees: number;
  deploymentId: string;
}

interface RawQueryFeePoint {
  dayNumber: number;
  chain_id: string;
  avg_query_fee: number;
  avg_gateway_latency_ms: number;
  gateway_query_success_rate: number;
  query_count: number;
  total_query_fees: number;
  subgraphDeployment: { id: string };
}

export function useQueryFees() {
  const { qosClient } = useGraphClient();

  return useQuery({
    queryKey: ['queryFees'] as const,
    queryFn: async (): Promise<QueryFeeRow[]> => {
      const client = qosClient.value;
      // Get latest day number (minus 1 for complete data)
      const dayData = await client.request<{
        queryDailyDataPoints: Array<{ dayNumber: number }>;
      }>(LATEST_DAY_QUERY);
      const dayNumber = (dayData.queryDailyDataPoints[0]?.dayNumber ?? 1) - 1;

      const data = await client.request<{
        queryDailyDataPoints: RawQueryFeePoint[];
      }>(QUERY_FEES_QUERY, { dayNumber });

      return data.queryDailyDataPoints.map((p) => ({
        dayNumber: p.dayNumber,
        chain_id: p.chain_id,
        avg_query_fee: p.avg_query_fee,
        avg_gateway_latency_ms: p.avg_gateway_latency_ms,
        gateway_query_success_rate: p.gateway_query_success_rate,
        query_count: p.query_count,
        total_query_fees: p.total_query_fees,
        deploymentId: p.subgraphDeployment.id,
      }));
    },
    staleTime: 120_000,
  });
}
