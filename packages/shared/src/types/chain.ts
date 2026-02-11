export type ChainId = 'mainnet' | 'arbitrum-one' | 'sepolia' | 'arbitrum-sepolia';

export interface ChainConfig {
  id: ChainId;
  rewardsContractAddress: string;
  stakingContractAddress: string;
  blocksPerDay: number;
  blockExplorer: string;
}

export interface NetworkState {
  totalTokensSignalled: bigint;
  issuancePerBlock: bigint;
  issuancePerYear: bigint;
  totalSupply: bigint;
  currentEpoch: number;
  totalTokensAllocated: bigint;
  maxThawingPeriod?: number;
  error: boolean;
}
