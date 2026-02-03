import { print } from 'graphql';
import { GET_ALLOCATIONS, GET_GRAPH_NETWORK } from '@indexer-tools/shared';
import type { Allocation } from '@indexer-tools/shared';
import type { NetworkDataSnapshot } from '../notifications/rules/Rule.js';

const DEFAULT_NETWORK_SUBGRAPH_URL =
  'https://api.thegraph.com/subgraphs/name/graphprotocol/graph-network-arbitrum';

export class NetworkPoller {
  private networkSubgraphUrl: string;

  constructor() {
    this.networkSubgraphUrl =
      process.env.NETWORK_SUBGRAPH_URL || DEFAULT_NETWORK_SUBGRAPH_URL;
  }

  async fetchAllocations(indexerAddress: string): Promise<Allocation[]> {
    const allAllocations: Allocation[] = [];
    let skip = 0;
    const query = print(GET_ALLOCATIONS);

    while (true) {
      const response = await fetch(this.networkSubgraphUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { indexer: indexerAddress, skip },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Network subgraph request failed (${response.status}): ${await response.text()}`,
        );
      }

      const json = (await response.json()) as {
        data?: { allocations: Allocation[] };
        errors?: Array<{ message: string }>;
      };

      if (json.errors && json.errors.length > 0) {
        throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
      }

      const allocations = json.data?.allocations ?? [];
      allAllocations.push(...allocations);

      if (allocations.length < 1000) break;
      skip += 1000;
    }

    return allAllocations;
  }

  async fetchNetworkData(): Promise<NetworkDataSnapshot> {
    const query = print(GET_GRAPH_NETWORK);

    const response = await fetch(this.networkSubgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(
        `Network subgraph request failed (${response.status}): ${await response.text()}`,
      );
    }

    const json = (await response.json()) as {
      data?: {
        graphNetwork: {
          totalTokensSignalled: string;
          networkGRTIssuancePerBlock: string;
          totalSupply: string;
          currentEpoch: number;
          totalTokensAllocated: string;
          maxThawingPeriod: number;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    const network = json.data?.graphNetwork;
    if (!network) {
      throw new Error('No graphNetwork data returned from subgraph');
    }

    return {
      totalTokensSignalled: network.totalTokensSignalled,
      networkGRTIssuancePerBlock: network.networkGRTIssuancePerBlock,
      totalSupply: network.totalSupply,
      currentEpoch: network.currentEpoch,
      totalTokensAllocated: network.totalTokensAllocated,
      maxThawingPeriod: network.maxThawingPeriod,
    };
  }
}
