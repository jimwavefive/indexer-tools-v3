export interface SubgraphManifest {
  id: string;
  deployment: {
    id: string;
    deniedAt: number | null;
    createdAt: number;
    indexingRewardAmount: bigint;
    ipfsHash: string;
    queryFeesAmount: bigint;
    signalledTokens: bigint;
    stakedTokens: bigint;
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
  apr: number;
  newApr: number;
  dailyRewards: number;
  dailyRewardsCut: number;
  maxAllo: number;
  currentlyAllocated: boolean;
  deploymentStatus: unknown;
  upgradeIndexer: unknown;
  numEntities: string | null;
  futureStakedTokens: bigint;
  queryFees?: unknown;
}
