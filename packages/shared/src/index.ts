// GraphQL queries & client
export {
  GET_GRAPH_NETWORK,
  GET_SUBGRAPHS,
  GET_SUBGRAPHS_NO_NETWORK_FILTER,
  GET_ALLOCATIONS,
} from './graphql/queries.js';
export { createGraphClient } from './graphql/client.js';

// Math utilities
export {
  maxAllo,
  calculateApr,
  calculateNewApr,
  calculateAllocationDailyRewards,
  calculateSubgraphDailyRewards,
  indexerCut,
  calculateAutoTargetApr,
} from './math/calc.js';
export type { NetworkData, SelectedSubgraph, FutureStakedEntry } from './math/calc.js';

export { toWei, fromWei, weiToNumber, parseBigInt, WEI_PER_ETHER } from './math/wei.js';
export { formatGrt, formatApr, formatDuration } from './math/format.js';

// Types
export type {
  Allocation,
  EnrichedAllocation,
  SubgraphDeployment,
  PendingRewardsData,
  StatusChecks,
} from './types/allocation.js';
export type { SubgraphManifest, EnrichedSubgraph } from './types/subgraph.js';
export type { ChainId, ChainConfig, NetworkState } from './types/chain.js';
export type {
  RuleConfig,
  ChannelConfig,
  NotificationSeverity,
  Notification,
  IncidentRecord,
  HistoryRecord,
  IncidentChangeEvent,
} from './types/notification.js';

// Config
export { CHAIN_CONFIGS, CHAIN_NAME_MAP } from './config/chains.js';
