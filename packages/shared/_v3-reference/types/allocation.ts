import type BigNumber from 'bignumber.js';

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
  stakedTokens: string;
  indexingRewardAmount: string;
  signalledTokens: string;
  queryFeesAmount: string;
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
  allocatedTokens: string;
  effectiveAllocation: string;
  createdAt: number;
  createdAtEpoch: number;
  createdAtBlockHash: string;
  createdAtBlockNumber: number;
  indexingRewards: string;
  indexingIndexerRewards: string;
  indexingDelegatorRewards: string;
  isLegacy: boolean;
}

export interface EnrichedAllocation extends Allocation {
  activeDuration: number;
  readableDuration: string;
  epochDuration: number;
  proportion: number;
  apr: string | number;
  dailyRewards: BigNumber | number;
  dailyRewardsCut: BigNumber | number;
  pendingRewards: PendingRewardsData;
  pendingRewardsCut: BigNumber;
  deploymentStatus: unknown;
  statusChecks: StatusChecks;
  qos?: unknown;
  queryFees?: unknown;
}

export interface PendingRewardsData {
  value: BigNumber;
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
