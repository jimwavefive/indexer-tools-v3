export type ChainId = 'mainnet' | 'arbitrum-one' | 'sepolia' | 'arbitrum-sepolia';

export interface ChainConfig {
  id: ChainId;
  rewardsContractAddress: string;
  stakingContractAddress: string;
  blocksPerDay: number;
  blockExplorer: string;
}

export interface NetworkState {
  totalTokensSignalled: string;
  issuancePerBlock: string;
  issuancePerYear: string;
  totalSupply: string;
  currentEpoch: string;
  totalTokensAllocated: string;
  maxThawingPeriod?: string;
  error: boolean;
}
