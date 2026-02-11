import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useAccount } from './useAccount';

const STATUS_QUERY = `{
  indexingStatuses {
    subgraph
    synced
    health
    entityCount
    fatalError { message deterministic block { number } }
    chains { earliestBlock { number } latestBlock { number } chainHeadBlock { number } }
  }
}`;

export interface DeploymentStatus {
  subgraph: string;
  synced: boolean;
  health: 'healthy' | 'failed' | string;
  entityCount: number;
  fatalError: {
    message: string;
    deterministic: boolean;
    block: { number: string };
  } | null;
  chains: Array<{
    earliestBlock: { number: string } | null;
    latestBlock: { number: string } | null;
    chainHeadBlock: { number: string } | null;
  }>;
}

export interface EnrichedDeploymentStatus extends DeploymentStatus {
  blocksBehindChainhead: number;
  statusLabel: string;
  statusColor: string;
}

function enrichStatus(status: DeploymentStatus): EnrichedDeploymentStatus {
  const chain = status.chains?.[0];
  const latestBlock = chain?.latestBlock?.number ? parseInt(chain.latestBlock.number, 10) : 0;
  const chainHead = chain?.chainHeadBlock?.number ? parseInt(chain.chainHeadBlock.number, 10) : 0;
  const blocksBehind = chainHead > 0 && latestBlock > 0 ? chainHead - latestBlock : Number.MAX_SAFE_INTEGER;

  let statusLabel: string;
  let statusColor: string;

  if (status.health === 'failed' && status.fatalError && !status.fatalError.deterministic) {
    statusLabel = 'Failed NONDET';
    statusColor = 'yellow';
  } else if (status.health === 'failed' && status.fatalError?.deterministic) {
    statusLabel = 'Failed DET';
    statusColor = 'red';
  } else if (status.health === 'healthy' && status.synced) {
    statusLabel = 'Synced';
    statusColor = 'green';
  } else if (status.health === 'healthy' && !status.synced) {
    statusLabel = 'Syncing';
    statusColor = 'blue';
  } else {
    statusLabel = status.health || 'Unknown';
    statusColor = 'default';
  }

  return { ...status, blocksBehindChainhead: blocksBehind, statusLabel, statusColor };
}

async function fetchStatuses(url: string): Promise<EnrichedDeploymentStatus[]> {
  const statusUrl = new URL('/status', url).href;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: STATUS_QUERY }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const json = await res.json();
    const statuses: DeploymentStatus[] = json.data?.indexingStatuses ?? [];
    return statuses.map(enrichStatus);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export function useDeploymentStatus() {
  const { data: account } = useAccount();

  const indexerUrl = computed(() => account.value?.url ?? '');

  return useQuery({
    queryKey: computed(() => ['deploymentStatus', indexerUrl.value] as const),
    queryFn: () => fetchStatuses(indexerUrl.value),
    enabled: computed(() => !!indexerUrl.value),
    staleTime: 60_000,
  });
}
