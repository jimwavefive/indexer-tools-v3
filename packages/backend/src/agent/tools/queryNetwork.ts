import type { ToolDefinition } from '../provider.js';

const NETWORK_SUBGRAPH_URL =
  process.env.NETWORK_SUBGRAPH_URL ??
  'https://api.thegraph.com/subgraphs/name/graphprotocol/graph-network-arbitrum';

export const queryNetworkSubgraphDefinition: ToolDefinition = {
  name: 'queryNetworkSubgraph',
  description:
    'Execute a raw GraphQL query against The Graph Network subgraph. ' +
    'Use this to fetch any on-chain data about indexers, allocations, subgraphs, ' +
    'delegators, curators, or the graph network itself.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'A valid GraphQL query string to execute against the network subgraph.',
      },
      variables: {
        type: 'object',
        description: 'Optional GraphQL variables object.',
      },
    },
    required: ['query'],
  },
};

export async function queryNetworkSubgraph(args: {
  query: string;
  variables?: Record<string, any>;
}): Promise<any> {
  const response = await fetch(NETWORK_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: args.query,
      variables: args.variables ?? {},
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Network subgraph query failed (${response.status}): ${text}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}
