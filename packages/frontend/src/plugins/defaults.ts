import { reactive } from 'vue';
import type { ChainId } from '@indexer-tools/shared';

export interface Account {
  address: string;
  name: string;
  chain: ChainId;
  active: boolean;
  poiQuery: boolean;
  poiQueryEndpoint: string;
  agentConnect: boolean;
  agentEndpoint: string;
}

export interface RuntimeConfig {
  accounts: Account[];
  subgraphEndpoints: Record<ChainId, string>;
  qosSubgraph: string;
  apiKey: string;
  rpcDefaults: Partial<Record<ChainId, string>>;
  chainValidationRpcs: Record<string, string>;
  blacklist: string[];
}

const DEFAULT_SUBGRAPH_ENDPOINTS: Record<ChainId, string> = {
  'mainnet': 'https://gateway.thegraph.com/api/[api-key]/subgraphs/id/9Co7EQe5PgW3ugCUJrJgRv4u9zdEuDJf8NvMWftNsBH8',
  'arbitrum-one': 'https://gateway.thegraph.com/api/[api-key]/subgraphs/id/DZz4kDTdmzWLWsV373w2bSmoar3umKKH9y82SUKr5qmp',
  'sepolia': 'https://gateway.thegraph.com/api/[api-key]/subgraphs/id/8pVKDwHniAz87CHEQsiz2wgFXGZXrbMDkrxgauVVfMJC',
  'arbitrum-sepolia': 'https://gateway.thegraph.com/api/[api-key]/subgraphs/id/3xQHhMudr1oh69ut36G2mbzpYmYxwqCeU6wwqyCDCnqV',
};

const DEFAULT_API_KEY = '3bab348a7c385b1870039eb890fd0a5f';

const config = reactive<RuntimeConfig>({
  accounts: [],
  subgraphEndpoints: { ...DEFAULT_SUBGRAPH_ENDPOINTS },
  qosSubgraph: 'https://gateway.thegraph.com/api/[api-key]/subgraphs/id/Dtr9rETvwokot4BSXaD5tECanXfqfJKcvHuaaEgPDD2D',
  apiKey: DEFAULT_API_KEY,
  rpcDefaults: {},
  chainValidationRpcs: {},
  blacklist: [],
});

function replaceApiKey(url: string, apiKey: string): string {
  return url.replace('[api-key]', apiKey).replace('{api-key}', apiKey);
}

export async function loadRuntimeConfig(): Promise<void> {
  // 1. Load config JSON written by docker-entrypoint.sh
  try {
    const resp = await fetch('/indexer-tools-config.json');
    if (resp.ok) {
      const json = await resp.json();

      if (json.DEFAULT_ACCOUNTS && Array.isArray(json.DEFAULT_ACCOUNTS)) {
        config.accounts = json.DEFAULT_ACCOUNTS.map((a: Account) => ({
          ...a,
          address: a.address.toLowerCase(),
        }));
      }

      if (json.GRAPH_API_KEY) config.apiKey = json.GRAPH_API_KEY;

      const subgraphMap: Record<string, ChainId> = {
        DEFAULT_SUBGRAPH_MAINNET: 'mainnet',
        DEFAULT_SUBGRAPH_ARBITRUM: 'arbitrum-one',
        DEFAULT_SUBGRAPH_SEPOLIA: 'sepolia',
        DEFAULT_SUBGRAPH_ARBITRUM_SEPOLIA: 'arbitrum-sepolia',
      };
      for (const [envKey, chainId] of Object.entries(subgraphMap)) {
        if (json[envKey]) config.subgraphEndpoints[chainId] = json[envKey];
      }

      if (json.DEFAULT_QOS_SUBGRAPH) config.qosSubgraph = json.DEFAULT_QOS_SUBGRAPH;

      const rpcMap: Record<string, ChainId> = {
        DEFAULT_RPC_MAINNET: 'mainnet',
        DEFAULT_RPC_ARBITRUM: 'arbitrum-one',
        DEFAULT_RPC_SEPOLIA: 'sepolia',
        DEFAULT_RPC_ARBITRUM_SEPOLIA: 'arbitrum-sepolia',
      };
      for (const [envKey, chainId] of Object.entries(rpcMap)) {
        if (json[envKey]) config.rpcDefaults[chainId] = json[envKey];
      }

      if (json.CHAIN_VALIDATION_RPCS && typeof json.CHAIN_VALIDATION_RPCS === 'object') {
        config.chainValidationRpcs = json.CHAIN_VALIDATION_RPCS;
      }
    }
  } catch {
    // No config file available — use defaults
  }

  // 2. Override from Vite build-time env vars (lower priority than runtime JSON)
  const envApiKey = import.meta.env.VITE_GRAPH_API_KEY;
  if (envApiKey && !config.apiKey) config.apiKey = envApiKey;

  // 3. Load blacklist.txt
  try {
    const blResp = await fetch('/blacklist.txt');
    if (blResp.ok) {
      const text = await blResp.text();
      config.blacklist = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    }
  } catch {
    // No blacklist file
  }
}

export function getSubgraphUrl(chainId: ChainId): string {
  const raw = config.subgraphEndpoints[chainId] || DEFAULT_SUBGRAPH_ENDPOINTS[chainId];
  return replaceApiKey(raw, config.apiKey);
}

export function getQosSubgraphUrl(): string {
  return replaceApiKey(config.qosSubgraph, config.apiKey);
}

export function useRuntimeConfig(): RuntimeConfig {
  return config;
}
