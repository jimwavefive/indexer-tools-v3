import { print } from 'graphql';
import { GET_ALLOCATIONS, GET_GRAPH_NETWORK } from '@indexer-tools/shared';
import type { Allocation } from '@indexer-tools/shared';
import type { NetworkDataSnapshot, DeploymentStatus, IndexerData } from '../notifications/rules/Rule.js';

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

  async fetchIndexerUrl(indexerAddress: string): Promise<string | null> {
    const query = `{ indexer(id: "${indexerAddress.toLowerCase()}") { url } }`;

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
      data?: { indexer?: { url: string } };
      errors?: Array<{ message: string }>;
    };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    return json.data?.indexer?.url || null;
  }

  async fetchIndexerData(indexerAddress: string): Promise<IndexerData | null> {
    const query = `{ indexer(id: "${indexerAddress.toLowerCase()}") { tokenCapacity stakedTokens allocatedTokens availableStake } }`;

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
      data?: { indexer?: { tokenCapacity: string; stakedTokens: string; allocatedTokens: string; availableStake: string } };
      errors?: Array<{ message: string }>;
    };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    const indexer = json.data?.indexer;
    if (!indexer) return null;

    return {
      tokenCapacity: indexer.tokenCapacity,
      stakedTokens: indexer.stakedTokens,
      allocatedTokens: indexer.allocatedTokens,
      availableStake: indexer.availableStake,
    };
  }

  async fetchDeploymentStatuses(endpoint: string, deploymentHashes?: string[]): Promise<Map<string, DeploymentStatus>> {
    const statuses = new Map<string, DeploymentStatus>();

    if (deploymentHashes && deploymentHashes.length > 0) {
      // Batch to stay under the 4096-byte query size limit (~50 hashes per batch)
      const BATCH_SIZE = 50;
      const MAX_CONCURRENCY = 3;
      const MAX_RETRIES = 2;
      const batches: string[][] = [];
      for (let i = 0; i < deploymentHashes.length; i += BATCH_SIZE) {
        batches.push(deploymentHashes.slice(i, i + BATCH_SIZE));
      }

      // Process batches with limited concurrency and retries
      let pending = batches.map((batch, idx) => ({ batch, idx, retries: 0 }));

      while (pending.length > 0) {
        const chunk = pending.splice(0, MAX_CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map((item) => this.fetchDeploymentStatusesBatch(endpoint, item.batch)),
        );

        const retry: typeof pending = [];
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled') {
            for (const [key, value] of result.value) {
              statuses.set(key, value);
            }
          } else if (chunk[i].retries < MAX_RETRIES) {
            console.warn(`Status batch ${chunk[i].idx} failed (attempt ${chunk[i].retries + 1}), retrying: ${result.reason?.message || result.reason}`);
            retry.push({ ...chunk[i], retries: chunk[i].retries + 1 });
          } else {
            console.error(`Status batch ${chunk[i].idx} failed after ${MAX_RETRIES + 1} attempts: ${result.reason?.message || result.reason}`);
          }
        }

        // Add retries back to the front of the queue
        pending.unshift(...retry);
      }
    } else {
      const batchStatuses = await this.fetchDeploymentStatusesBatch(endpoint);
      for (const [key, value] of batchStatuses) {
        statuses.set(key, value);
      }
    }

    return statuses;
  }

  private async fetchDeploymentStatusesBatch(endpoint: string, hashes?: string[]): Promise<Map<string, DeploymentStatus>> {
    const subgraphsArg = hashes && hashes.length > 0
      ? `(subgraphs: ${JSON.stringify(hashes)})`
      : '';

    const query = `{
      indexingStatuses${subgraphsArg} {
        subgraph
        health
        synced
        fatalError {
          message
          handler
          deterministic
        }
        chains {
          network
          chainHeadBlock { number }
          latestBlock { number }
        }
      }
    }`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(
        `Status endpoint request failed (${response.status}): ${await response.text()}`,
      );
    }

    const json = (await response.json()) as {
      data?: { indexingStatuses: DeploymentStatus[] };
      errors?: Array<{ message: string }>;
    };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Status endpoint errors: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    const statuses = new Map<string, DeploymentStatus>();
    for (const status of json.data?.indexingStatuses ?? []) {
      statuses.set(status.subgraph, status);
    }

    return statuses;
  }
}
