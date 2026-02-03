import { fromWei } from '@indexer-tools/shared';
import type { ToolDefinition } from '../provider.js';
import { queryNetworkSubgraph } from './queryNetwork.js';

export const getEpochInfoDefinition: ToolDefinition = {
  name: 'getEpochInfo',
  description:
    'Get current epoch information for The Graph network, including total signal, ' +
    'total allocated tokens, issuance rate, and current epoch number.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

export async function getEpochInfo(): Promise<any> {
  const result = await queryNetworkSubgraph({
    query: `{
      graphNetwork(id: 1) {
        currentEpoch
        totalTokensSignalled
        totalTokensAllocated
        networkGRTIssuancePerBlock
        totalSupply
      }
    }`,
  });

  const network = result.graphNetwork;

  return {
    currentEpoch: parseInt(network.currentEpoch),
    totalTokensSignalledGRT: fromWei(network.totalTokensSignalled),
    totalTokensAllocatedGRT: fromWei(network.totalTokensAllocated),
    issuancePerBlock: network.networkGRTIssuancePerBlock,
    issuancePerBlockGRT: fromWei(network.networkGRTIssuancePerBlock),
    totalSupplyGRT: fromWei(network.totalSupply),
  };
}
