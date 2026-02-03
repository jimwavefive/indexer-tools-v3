import BigNumber from 'bignumber.js';
import { calculateAutoTargetApr, maxAllo, fromWei, calculateApr } from '@indexer-tools/shared';
import type { NetworkData, SelectedSubgraph, FutureStakedEntry } from '@indexer-tools/shared';
import type { ToolDefinition } from '../provider.js';
import { queryNetworkSubgraph } from './queryNetwork.js';

export const proposeRebalanceDefinition: ToolDefinition = {
  name: 'proposeRebalance',
  description:
    'Analyze current allocations and available subgraphs to propose optimal allocation changes. ' +
    'Suggests which allocations to close, which subgraphs to open new allocations on, and ' +
    'recommended stake amounts. Uses auto-target APR calculation when no target is specified.',
  parameters: {
    type: 'object',
    properties: {
      indexerAddress: {
        type: 'string',
        description: 'The Ethereum address of the indexer (0x...).',
      },
      targetApr: {
        type: 'number',
        description:
          'Optional target APR percentage. If not provided, auto-target APR is calculated.',
      },
    },
    required: ['indexerAddress'],
  },
};

export async function proposeRebalance(args: {
  indexerAddress: string;
  targetApr?: number;
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

  // Fetch indexer info
  const indexerResult = await queryNetworkSubgraph({
    query: `query indexer($id: String!) {
      indexer(id: $id) {
        stakedTokens
        allocatedTokens
        delegatedTokens
        tokenCapacity
        delegationExchangeRate
      }
    }`,
    variables: { id: args.indexerAddress.toLowerCase() },
  });

  const indexer = indexerResult.indexer;
  if (!indexer) {
    throw new Error(`Indexer ${args.indexerAddress} not found`);
  }

  const stakedTokens = new BigNumber(indexer.stakedTokens);
  const allocatedTokens = new BigNumber(indexer.allocatedTokens);
  const tokenCapacity = new BigNumber(indexer.tokenCapacity ?? indexer.stakedTokens);
  const availableStake = tokenCapacity.minus(allocatedTokens);

  // Fetch current allocations
  const allocResult = await queryNetworkSubgraph({
    query: `query allocations($indexer: String!) {
      allocations(
        first: 1000
        where: { activeForIndexer_contains_nocase: $indexer, status: Active }
        orderBy: createdAtBlockNumber
        orderDirection: desc
      ) {
        id
        allocatedTokens
        subgraphDeployment {
          ipfsHash
          originalName
          stakedTokens
          signalledTokens
          deniedAt
          manifest { network }
          versions(first: 1, orderBy: version, orderDirection: desc) {
            subgraph { metadata { displayName } }
          }
        }
      }
    }`,
    variables: { indexer: args.indexerAddress.toLowerCase() },
  });

  const currentAllocations = allocResult.allocations ?? [];

  // Fetch top subgraphs by signal
  const subgraphsResult = await queryNetworkSubgraph({
    query: `{
      subgraphDeployments(
        first: 100
        orderBy: signalledTokens
        orderDirection: desc
        where: { signalledTokens_gt: "0" }
      ) {
        ipfsHash
        stakedTokens
        signalledTokens
        deniedAt
        manifest { network }
        versions(first: 1, orderBy: version, orderDirection: desc) {
          subgraph { metadata { displayName } }
        }
      }
    }`,
  });

  const topSubgraphs = subgraphsResult.subgraphDeployments ?? [];

  // Identify allocations to close (denied or zero signal)
  const toClose = currentAllocations
    .filter((a: any) => {
      const d = a.subgraphDeployment;
      return (
        (d.deniedAt !== null && d.deniedAt !== 0) ||
        new BigNumber(d.signalledTokens).isZero()
      );
    })
    .map((a: any) => ({
      id: a.id,
      deploymentIpfsHash: a.subgraphDeployment.ipfsHash,
      displayName:
        a.subgraphDeployment.versions?.[0]?.subgraph?.metadata?.displayName ??
        a.subgraphDeployment.originalName ??
        a.subgraphDeployment.ipfsHash,
      allocatedTokensGRT: fromWei(a.allocatedTokens),
      reason: a.subgraphDeployment.deniedAt ? 'denied' : 'zero_signal',
    }));

  const closingStake = toClose.reduce(
    (sum: BigNumber, a: any) => sum.plus(new BigNumber(a.allocatedTokensGRT)),
    new BigNumber(0),
  );

  // Calculate target APR
  let targetApr: BigNumber;

  if (args.targetApr != null) {
    targetApr = new BigNumber(args.targetApr);
  } else {
    // Use eligible subgraphs for auto target APR
    const eligibleSubgraphs: SelectedSubgraph[] = topSubgraphs
      .filter((s: any) => (s.deniedAt === null || s.deniedAt === 0) && !new BigNumber(s.signalledTokens).isZero())
      .slice(0, 20)
      .map((s: any) => ({
        deployment: {
          deniedAt: s.deniedAt,
          signalledTokens: s.signalledTokens,
        },
      }));

    const futureStaked: FutureStakedEntry[] = eligibleSubgraphs.map((s) => ({
      futureStakedTokens: '0',
    }));

    const WEI_PER_ETHER = new BigNumber(10).pow(18);
    const availableStakeWei = availableStake.plus(closingStake.multipliedBy(WEI_PER_ETHER));
    const closingStakeWei = closingStake.multipliedBy(WEI_PER_ETHER);

    targetApr = calculateAutoTargetApr(
      eligibleSubgraphs,
      futureStaked,
      networkData,
      availableStakeWei.toFixed(),
      closingStakeWei.toFixed(),
    );
  }

  // Propose new allocations based on target APR
  const currentDeploymentIds = new Set(
    currentAllocations.map((a: any) => a.subgraphDeployment.ipfsHash),
  );
  const closingIds = new Set(toClose.map((a: any) => a.deploymentIpfsHash));

  const toOpen: any[] = [];
  const WEI_PER_ETHER = new BigNumber(10).pow(18);

  for (const sub of topSubgraphs) {
    if (sub.deniedAt !== null && sub.deniedAt !== 0) continue;
    if (new BigNumber(sub.signalledTokens).isZero()) continue;

    // Skip if already allocated and not being closed
    if (currentDeploymentIds.has(sub.ipfsHash) && !closingIds.has(sub.ipfsHash)) continue;

    const suggestedAllocation = maxAllo(
      targetApr.toFixed(2),
      sub.signalledTokens,
      networkData,
      sub.stakedTokens,
    );

    if (suggestedAllocation.isLessThanOrEqualTo(0)) continue;

    const apr = calculateApr(sub.signalledTokens, sub.stakedTokens, networkData);

    toOpen.push({
      deploymentIpfsHash: sub.ipfsHash,
      displayName:
        sub.versions?.[0]?.subgraph?.metadata?.displayName ?? sub.ipfsHash,
      network: sub.manifest?.network ?? 'unknown',
      signalledTokensGRT: fromWei(sub.signalledTokens),
      currentApr: apr.toFixed(2) + '%',
      suggestedAllocationGRT: suggestedAllocation.toFixed(2),
    });

    if (toOpen.length >= 15) break;
  }

  return {
    indexer: args.indexerAddress,
    currentEpoch: network.currentEpoch,
    availableStakeGRT: fromWei(availableStake.toFixed(0)),
    targetApr: targetApr.toFixed(2) + '%',
    autoCalculatedApr: args.targetApr == null,
    proposedClosures: toClose,
    closingStakeGRT: closingStake.toFixed(2),
    proposedOpenings: toOpen,
    summary: {
      currentAllocations: currentAllocations.length,
      closingCount: toClose.length,
      openingCount: toOpen.length,
    },
  };
}
