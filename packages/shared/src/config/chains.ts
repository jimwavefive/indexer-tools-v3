import type { ChainConfig, ChainId } from '../types/chain';

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  'mainnet': {
    id: 'mainnet',
    rewardsContractAddress: '0x9Ac758AB77733b4150A901ebd659cbF8cB93ED66',
    stakingContractAddress: '0xF55041E37E12cD407ad00CE2910B8269B01263b9',
    blocksPerDay: 7200,
    blockExplorer: 'https://etherscan.io',
  },
  'arbitrum-one': {
    id: 'arbitrum-one',
    rewardsContractAddress: '0x971B9d3d0Ae3ECa029CAB5eA1fB0F72c85e6a525',
    stakingContractAddress: '0x00669A4CF01450B64E8A2A20E9b1FCB71E61eF03',
    blocksPerDay: 5760,
    blockExplorer: 'https://arbiscan.io',
  },
  'sepolia': {
    id: 'sepolia',
    rewardsContractAddress: '0x9a86322dEa5136C74ee6d1b06F4Ab9A6bB2724E0',
    stakingContractAddress: '0x14e9B07Dc56A0B03ac8A58453B5cCCB289d6ec90',
    blocksPerDay: 43200,
    blockExplorer: 'https://sepolia.etherscan.io',
  },
  'arbitrum-sepolia': {
    id: 'arbitrum-sepolia',
    rewardsContractAddress: '0x00b9d319E3D09E83c62f453B44354049Dd93a345',
    stakingContractAddress: '0x865365C425f3A593Ffe698D9c4E6707D14d51e08',
    blocksPerDay: 43200,
    blockExplorer: 'https://sepolia.arbiscan.io',
  },
};

/**
 * Chain name mapping for DRPC and validation.
 */
export const CHAIN_NAME_MAP: Record<string, string> = {
  'mainnet': 'ethereum',
  'arbitrum-one': 'arbitrum',
  'matic': 'polygon',
  'mode-mainnet': 'mode',
  'blast-mainnet': 'blast',
};
