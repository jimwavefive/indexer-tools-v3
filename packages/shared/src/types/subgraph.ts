import type BigNumber from 'bignumber.js';

export interface SubgraphManifest {
  id: string;
  deployment: {
    id: string;
    deniedAt: number | null;
    createdAt: number;
    indexingRewardAmount: string;
    ipfsHash: string;
    queryFeesAmount: string;
    signalledTokens: string;
    stakedTokens: string;
    manifest: {
      network: string;
      poweredBySubstreams: boolean;
    };
    versions: Array<{
      metadata: {
        subgraphVersion: {
          subgraph: {
            metadata: {
              displayName: string;
              image: string;
              description: string;
            };
          };
        };
      };
    }>;
  };
}

export interface EnrichedSubgraph extends SubgraphManifest {
  proportion: number;
  apr: BigNumber | number;
  newApr: BigNumber | number;
  dailyRewards: BigNumber | number;
  dailyRewardsCut: BigNumber | number;
  maxAllo: BigNumber | number;
  currentlyAllocated: boolean;
  deploymentStatus: unknown;
  upgradeIndexer: unknown;
  numEntities: string | null;
  futureStakedTokens: BigNumber;
  queryFees?: unknown;
}
