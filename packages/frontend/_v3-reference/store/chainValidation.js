// Utilities
import { defineStore } from 'pinia'
import { useAccountStore } from './accounts'
import { useChainStore } from './chains';
import { useEpochStore } from './epochStore';
import { useSubgraphSettingStore } from './subgraphSettings';
import { loadDefaultsConfig } from '@/plugins/defaultsConfig';
import gql from 'graphql-tag';
const accountStore = useAccountStore();
const chainStore = useChainStore();
const epochStore = useEpochStore();
const subgraphSettingStore = useSubgraphSettingStore();

const defaultsConfigVariables = await loadDefaultsConfig();
const defaultsConfig = defaultsConfigVariables.variables;

await epochStore.init();

const CHAIN_MAP = {
  "mainnet":"ethereum",
  "arbitrum-one":"arbitrum",
  "matic":"polygon",
  "mode-mainnet":"mode",
  "blast-mainnet":"blast",
}

async function fetchBlockHash(rpcUrl, blockNumber) {
  const hexBlock = '0x' + blockNumber.toString(16);
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBlockByNumber',
      params: [hexBlock, false],
    }),
  });
  if (!res.ok) throw new Error(`RPC returned ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result?.hash || null;
}

function getRpcUrl(chain) {
  // Priority: localStorage settings > runtime config > DRPC fallback
  const settingsRpcs = subgraphSettingStore.settings.chainValidationRpcs || {};
  if (settingsRpcs[chain]) return settingsRpcs[chain];

  const defaultRpcs = defaultsConfig.chainValidationRpcs || {};
  if (defaultRpcs[chain]) return defaultRpcs[chain];

  // Fallback to DRPC
  return `https://lb.drpc.org/ogrpc?network=${CHAIN_MAP[chain] || chain}&dkey=AgtfLeG1hEcCoP3Z3d3iRXjHXnqN8zkR74Ro-gTye0yN`;
}

export const useChainValidationStore = defineStore('chainValidationStore', {
  state: () => ({
    chainStatus: {},
    loading: false,
    loaded: false,
  }),
  getters: {
    getData: (state) => state.chainStatus,
    getChains: () => epochStore.getChains,
    getBlockNumbers: () => epochStore.getBlockNumbers,
    getChainStatus: (state) => {
      let chainStatus = {};
      for(let i in state.getChains){
        chainStatus[state.getChains[i]] = state.chainStatus[state.getChains[i]]?.externalBlockHash == `0x${state.chainStatus[state.getChains[i]]?.indexerBlockHash}`;
      }
      return chainStatus;
    },
  },
  actions: {
    async init(){
      if(!this.loading && !this.loaded)
        this.fetchData();
    },
    async fetchData(){
      this.loaded = false;
      this.loading = true;
      for(let i in this.getChains){
        this.chainStatus[this.getChains[i]] = {
          blockNumber: this.getBlockNumbers[this.getChains[i]],
          indexerBlockHash: "",
          externalBlockHash: "",
        }
      }


      for(let i in this.getChains){
        accountStore.getPOIQueryClient.query({
          query: gql`query blockHashFromNumber($network: String, $blockNumber: Int){ blockHashFromNumber(network: $network, blockNumber: $blockNumber) }`,
          variables: {
            network: this.getChains[i],
            blockNumber: this.chainStatus[this.getChains[i]].blockNumber,
          },
        })
        .then(({ data, networkStatus }) => {
          this.chainStatus[this.getChains[i]].indexerBlockHash = data.blockHashFromNumber;
          if(data.blockHashFromNumber != null){
            const rpcUrl = getRpcUrl(this.getChains[i]);
            const blockNumber = this.chainStatus[this.getChains[i]].blockNumber;

            fetchBlockHash(rpcUrl, blockNumber)
              .then(hash => {
                if (hash) {
                  this.chainStatus[this.getChains[i]].externalBlockHash = hash;
                }
              })
              .catch(error => console.error('Chain validation error', error));
          }
        });
      }

    },
    async update(){
      if(!this.loading){
        this.fetchData();
      }
    },
  },
})
