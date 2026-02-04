import type { Allocation } from '@indexer-tools/shared';
import type { Notification } from '../channels/Channel.js';

export interface DeploymentStatus {
  subgraph: string; // deployment IPFS hash
  health: 'healthy' | 'unhealthy' | 'failed';
  synced: boolean;
  fatalError?: { message: string; handler: string | null; deterministic: boolean };
  chains: Array<{
    network: string;
    chainHeadBlock: { number: string };
    latestBlock: { number: string };
  }>;
}

export interface NetworkDataSnapshot {
  totalTokensSignalled: string;
  networkGRTIssuancePerBlock: string;
  totalSupply: string;
  currentEpoch: number;
  totalTokensAllocated: string;
  maxThawingPeriod: number;
}

export interface RuleContext {
  allocations: Allocation[];
  networkData: NetworkDataSnapshot;
  previousState: PreviousState;
  deploymentStatuses?: Map<string, DeploymentStatus>;
}

export interface PreviousState {
  allocations: Allocation[];
}

export interface RuleResult {
  triggered: boolean;
  notifications: Notification[];
  filterSummary?: string;
}

export interface Rule {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  conditions: Record<string, unknown>;
  evaluate(context: RuleContext): RuleResult;
}

export interface RuleConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  conditions: Record<string, unknown>;
}
