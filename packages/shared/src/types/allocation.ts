export interface SubgraphDeployment {
  versions: Array<{
    subgraph: {
      id: string;
      currentVersion?: {
        subgraphDeployment: {
          ipfsHash: string;
        };
      };
      metadata: {
        image: string;
        displayName: string;
      };
    };
  }>;
  ipfsHash: string;
  createdAt: number;
  originalName: string;
  stakedTokens: bigint;
  indexingRewardAmount: bigint;
  signalledTokens: bigint;
  queryFeesAmount: bigint;
  deniedAt: number | null;
  manifest: {
    network: string;
  };
}

export interface Allocation {
  id: string;
  activeForIndexer: {
    id: string;
  };
  subgraphDeployment: SubgraphDeployment;
  allocatedTokens: bigint;
  effectiveAllocation: bigint;
  createdAt: number;
  createdAtEpoch: number;
  createdAtBlockHash: string;
  createdAtBlockNumber: number;
  indexingRewards: bigint;
  indexingIndexerRewards: bigint;
  indexingDelegatorRewards: bigint;
  isLegacy: boolean;
}

export interface EnrichedAllocation extends Allocation {
  activeDuration: number;
  readableDuration: string;
  epochDuration: number;
  proportion: number;
  apr: number;
  dailyRewards: number;
  dailyRewardsCut: number;
  pendingRewards: PendingRewardsData;
  pendingRewardsCut: bigint;
  deploymentStatus: unknown;
  statusChecks: StatusChecks;
  qos?: unknown;
  queryFees?: unknown;
}

export interface PendingRewardsData {
  value: bigint;
  loading: boolean;
  loaded: boolean;
}

export interface StatusChecks {
  synced: boolean;
  deterministicFailure: boolean | null;
  healthComparison: boolean;
  validChain: boolean | null;
  healthyCount: number;
  failedCount: number;
}
