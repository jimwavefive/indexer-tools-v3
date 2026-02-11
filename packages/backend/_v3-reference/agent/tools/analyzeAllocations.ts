import BigNumber from 'bignumber.js';
import { calculateApr, calculateAllocationDailyRewards, fromWei } from '@indexer-tools/shared';
import type { NetworkData } from '@indexer-tools/shared';
import type { ToolDefinition } from '../provider.js';
import { queryNetworkSubgraph } from './queryNetwork.js';

export const analyzeAllocationsDefinition: ToolDefinition = {
  name: 'analyzeAllocations',
  description:
    'Fetch and analyze all active allocations for a given indexer address. ' +
    'Returns each allocation enriched with current APR, daily rewards in GRT, ' +
    'epoch information, and human-readable amounts.',
  parameters: {
    type: 'object',
    properties: {
      indexerAddress: {
        type: 'string',
        description: 'The Ethereum address of the indexer (0x...).',
      },
    },
    required: ['indexerAddress'],
  },
};

export async function analyzeAllocations(args: {
  indexerAddress: string;
}): Promise<any> {
  // Fetch network data
  const networkResult = await queryNetworkSubgraph({
    query: `{
      graphNetwork(id: 1) {
        totalTokensSignalled
        networkGRTIssuancePerBlock
        totalSupply
        currentEpoch
        totalTokensAllocated
      }
    }`,
  });

  const network = networkResult.graphNetwork;
  const issuancePerBlock = new BigNumber(network.networkGRTIssuancePerBlock);
  const issuancePerYear = issuancePerBlock.multipliedBy(6450).multipliedBy(365);

  const networkData: NetworkData = {
    getTotalTokensSignalled: network.totalTokensSignalled,
    getIssuancePerYear: issuancePerYear.toFixed(),
    getIssuancePerBlock: network.networkGRTIssuancePerBlock,
  };

  // Fetch allocations (paginated)
  let allAllocations: any[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const allocResult = await queryNetworkSubgraph({
      query: `query allocations($indexer: String!, $skip: Int!) {
        allocations(
          first: 1000
          where: { activeForIndexer_contains_nocase: $indexer, status: Active }
          orderBy: createdAtBlockNumber
          orderDirection: desc
          skip: $skip
        ) {
          id
          subgraphDeployment {
            ipfsHash
            originalName
            stakedTokens
            signalledTokens
            deniedAt
            manifest { network }
            versions(first: 1, orderBy: version, orderDirection: desc) {
              subgraph {
                id
                metadata { displayName }
              }
            }
          }
          allocatedTokens
          createdAt
          createdAtEpoch
          indexingRewards
          indexingIndexerRewards
        }
      }`,
      variables: { indexer: args.indexerAddress.toLowerCase(), skip },
    });

    const batch = allocResult.allocations ?? [];
    allAllocations = allAllocations.concat(batch);
    hasMore = batch.length === 1000;
    skip += 1000;
  }

  // Enrich each allocation
  const enriched = allAllocations.map((alloc: any) => {
    const deployment = alloc.subgraphDeployment;
    const signalledTokens = deployment.signalledTokens;
    const stakedTokens = deployment.stakedTokens;
    const allocatedTokens = alloc.allocatedTokens;

    const apr = calculateApr(signalledTokens, stakedTokens, networkData);
    const dailyRewards = calculateAllocationDailyRewards(
      signalledTokens,
      stakedTokens,
      allocatedTokens,
      networkData,
    );

    const displayName =
      deployment.versions?.[0]?.subgraph?.metadata?.displayName ??
      deployment.originalName ??
      deployment.ipfsHash;

    const createdAtDate = new Date(parseInt(alloc.createdAt) * 1000);
    const ageMs = Date.now() - createdAtDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    return {
      id: alloc.id,
      deploymentIpfsHash: deployment.ipfsHash,
      displayName,
      network: deployment.manifest?.network ?? 'unknown',
      allocatedTokensGRT: fromWei(allocatedTokens),
      signalledTokensGRT: fromWei(signalledTokens),
      stakedTokensGRT: fromWei(stakedTokens),
      currentApr: apr.toFixed(2) + '%',
      dailyRewardsGRT: fromWei(dailyRewards.toFixed(0)),
      indexingRewardsGRT: fromWei(alloc.indexingRewards ?? '0'),
      createdAtEpoch: alloc.createdAtEpoch,
      ageDays,
      isDenied: deployment.deniedAt !== null && deployment.deniedAt !== 0,
    };
  });

  return {
    indexer: args.indexerAddress,
    currentEpoch: network.currentEpoch,
    totalAllocations: enriched.length,
    allocations: enriched,
  };
}
