import type { AgentTool } from './index.js';
import type { PollingScheduler } from '../../services/poller/scheduler.js';

let schedulerRef: PollingScheduler | null = null;

export function setSchedulerRef(scheduler: PollingScheduler): void {
  schedulerRef = scheduler;
}

function getScheduler(): PollingScheduler {
  if (!schedulerRef) {
    throw new Error('PollingScheduler not initialized for investigation tools');
  }
  return schedulerRef;
}

export const checkSubgraphHealth: AgentTool = {
  definition: {
    name: 'checkSubgraphHealth',
    description: 'Check the health and sync status of a specific subgraph deployment. Returns health status, sync progress, and any fatal errors.',
    parameters: {
      type: 'object',
      properties: {
        deploymentHash: {
          type: 'string',
          description: 'The IPFS hash of the subgraph deployment (e.g., "Qm...")',
        },
      },
      required: ['deploymentHash'],
    },
  },
  async execute(args: { deploymentHash: string }) {
    const scheduler = getScheduler();
    const statuses = scheduler.latestDeploymentStatuses;

    if (!statuses) {
      return {
        error: 'Deployment status data not available — waiting for poll cycle',
        deploymentHash: args.deploymentHash,
      };
    }

    const status = statuses.get(args.deploymentHash);

    if (!status) {
      return {
        error: 'Deployment not found in status data',
        deploymentHash: args.deploymentHash,
        note: 'This deployment may not be allocated by the indexer, or the status endpoint did not return it.',
      };
    }

    // Calculate blocks behind chainhead for each chain
    const chainInfo = status.chains.map((chain) => {
      const chainheadBlock = parseInt(chain.chainHeadBlock?.number || '0', 10);
      const latestBlock = parseInt(chain.latestBlock?.number || '0', 10);
      const blocksBehind = chainheadBlock - latestBlock;

      return {
        network: chain.network,
        chainheadBlock,
        latestBlock,
        blocksBehind,
        synced: blocksBehind < 100, // Consider synced if less than 100 blocks behind
      };
    });

    // Determine overall sync status
    const allSynced = chainInfo.every((c) => c.synced);
    const totalBlocksBehind = chainInfo.reduce((sum, c) => sum + Math.max(0, c.blocksBehind), 0);

    return {
      deploymentHash: args.deploymentHash,
      health: status.health,
      synced: status.synced,
      fatalError: status.fatalError || null,
      chains: chainInfo,
      summary: {
        allChainsSynced: allSynced,
        totalBlocksBehind,
        hasFatalError: !!status.fatalError,
        isHealthy: status.health === 'healthy' && !status.fatalError,
        isStale: status.health === 'failed' && allSynced, // Failed but synced = stale
      },
    };
  },
};

export const getSubgraphAllocation: AgentTool = {
  definition: {
    name: 'getSubgraphAllocation',
    description: 'Get allocation details for a specific subgraph deployment, including allocated GRT and epoch info.',
    parameters: {
      type: 'object',
      properties: {
        deploymentHash: {
          type: 'string',
          description: 'The IPFS hash of the subgraph deployment (e.g., "Qm...")',
        },
      },
      required: ['deploymentHash'],
    },
  },
  async execute(args: { deploymentHash: string }) {
    const scheduler = getScheduler();
    const allocations = scheduler.latestAllocations;
    const networkData = scheduler.latestNetworkData;

    if (!allocations || !networkData) {
      return {
        error: 'Allocation data not available — waiting for poll cycle',
        deploymentHash: args.deploymentHash,
      };
    }

    const matchingAllocations = allocations.filter(
      (a) => a.subgraphDeployment.ipfsHash === args.deploymentHash,
    );

    if (matchingAllocations.length === 0) {
      return {
        error: 'No allocations found for this deployment',
        deploymentHash: args.deploymentHash,
      };
    }

    return {
      deploymentHash: args.deploymentHash,
      currentEpoch: networkData.currentEpoch,
      allocations: matchingAllocations.map((a) => {
        const allocatedTokens = BigInt(a.allocatedTokens);
        const allocatedGRT = Number(allocatedTokens / BigInt(10 ** 18));
        const createdAtEpoch = a.createdAtEpoch;
        const epochDuration = networkData.currentEpoch - createdAtEpoch;

        return {
          id: a.id,
          allocatedGRT,
          createdAtEpoch,
          epochDuration,
          subgraphName: a.subgraphDeployment.versions?.[0]?.subgraph?.displayName ||
            a.subgraphDeployment.versions?.[0]?.subgraph?.metadata?.displayName ||
            'Unknown',
          closedAtEpoch: a.closedAtEpoch,
          status: a.status,
        };
      }),
    };
  },
};

export const investigationTools: AgentTool[] = [checkSubgraphHealth, getSubgraphAllocation];
