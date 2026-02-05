import type { ToolDefinition } from '../provider.js';
import {
  queryNetworkSubgraphDefinition,
  queryNetworkSubgraph,
} from './queryNetwork.js';
import {
  analyzeAllocationsDefinition,
  analyzeAllocations,
} from './analyzeAllocations.js';
import {
  getEpochInfoDefinition,
  getEpochInfo,
} from './getEpochInfo.js';
import {
  getDeploymentHealthDefinition,
  getDeploymentHealth,
} from './getDeploymentHealth.js';
import {
  proposeRebalanceDefinition,
  proposeRebalance,
} from './proposeRebalance.js';
import { incidentTools, setStoreRef as setIncidentStoreRef } from './incidentTools.js';
import { investigationTools, setSchedulerRef } from './investigationTools.js';
import { graphmanTools, setGraphmanStoreRef, setGraphmanContext } from './graphmanTools.js';

export interface AgentTool {
  definition: ToolDefinition;
  execute: (args: Record<string, any>) => Promise<any>;
}

export const agentTools: AgentTool[] = [
  {
    definition: queryNetworkSubgraphDefinition,
    execute: (args) => queryNetworkSubgraph(args as any),
  },
  {
    definition: analyzeAllocationsDefinition,
    execute: (args) => analyzeAllocations(args as any),
  },
  {
    definition: getEpochInfoDefinition,
    execute: () => getEpochInfo(),
  },
  {
    definition: getDeploymentHealthDefinition,
    execute: (args) => getDeploymentHealth(args as any),
  },
  {
    definition: proposeRebalanceDefinition,
    execute: (args) => proposeRebalance(args as any),
  },
  ...incidentTools,
  ...investigationTools,
  ...graphmanTools,
];

export {
  queryNetworkSubgraph,
  analyzeAllocations,
  getEpochInfo,
  getDeploymentHealth,
  proposeRebalance,
  setIncidentStoreRef,
  setSchedulerRef,
  setGraphmanStoreRef,
  setGraphmanContext,
};
