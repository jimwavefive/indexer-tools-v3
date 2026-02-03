import type { ToolDefinition } from '../provider.js';

export const getDeploymentHealthDefinition: ToolDefinition = {
  name: 'getDeploymentHealth',
  description:
    'Check the health and sync status of a specific subgraph deployment on an indexer. ' +
    'Queries the indexer status endpoint for indexing progress, chain head block, and errors.',
  parameters: {
    type: 'object',
    properties: {
      statusEndpoint: {
        type: 'string',
        description:
          'The indexer status endpoint URL (e.g. http://indexer:8030/graphql).',
      },
      deploymentId: {
        type: 'string',
        description:
          'The subgraph deployment IPFS hash (Qm... or bafy...) to check.',
      },
    },
    required: ['statusEndpoint', 'deploymentId'],
  },
};

export async function getDeploymentHealth(args: {
  statusEndpoint: string;
  deploymentId: string;
}): Promise<any> {
  const query = `{
    indexingStatuses(subgraphs: ["${args.deploymentId}"]) {
      subgraph
      synced
      health
      fatalError {
        message
        block {
          number
          hash
        }
        handler
      }
      nonFatalErrors {
        message
        block {
          number
          hash
        }
        handler
      }
      chains {
        network
        chainHeadBlock {
          number
        }
        earliestBlock {
          number
        }
        latestBlock {
          number
        }
      }
    }
  }`;

  const response = await fetch(args.statusEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Status endpoint query failed (${response.status}): ${text}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  const statuses = result.data?.indexingStatuses ?? [];

  if (statuses.length === 0) {
    return {
      deploymentId: args.deploymentId,
      found: false,
      message: 'Deployment not found on this indexer.',
    };
  }

  const status = statuses[0];
  const chain = status.chains?.[0];

  return {
    deploymentId: args.deploymentId,
    found: true,
    health: status.health,
    synced: status.synced,
    fatalError: status.fatalError
      ? {
          message: status.fatalError.message,
          block: status.fatalError.block?.number,
          handler: status.fatalError.handler,
        }
      : null,
    nonFatalErrorCount: status.nonFatalErrors?.length ?? 0,
    chain: chain
      ? {
          network: chain.network,
          chainHeadBlock: chain.chainHeadBlock?.number,
          earliestBlock: chain.earliestBlock?.number,
          latestBlock: chain.latestBlock?.number,
          blocksBehind:
            chain.chainHeadBlock?.number && chain.latestBlock?.number
              ? parseInt(chain.chainHeadBlock.number) - parseInt(chain.latestBlock.number)
              : null,
        }
      : null,
  };
}
