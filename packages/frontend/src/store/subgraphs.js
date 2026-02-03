import { defineStore } from 'pinia'
import { useNotificationStore } from './notifications';
import { applyStatusFilter } from '@/plugins/statusFilters';
import { GET_SUBGRAPHS, GET_SUBGRAPHS_NO_NETWORK_FILTER } from '@indexer-tools/shared/graphql/subgraphs';
import gql from 'graphql-tag';
import { toWei } from '@/plugins/web3Utils';
import { useNetworkStore } from './network';
import { useAccountStore } from './accounts';
import { useSubgraphSettingStore } from './subgraphSettings';
import { useAllocationStore } from './allocations';
import { useChainStore } from './chains';
import { useDeploymentStatusStore } from './deploymentStatuses';
import { useQueryFeesStore } from './queryFees';
import { storeToRefs } from 'pinia';
const networkStore = useNetworkStore();
const accountStore = useAccountStore();
const allocationStore = useAllocationStore();
const chainStore = useChainStore();
const deploymentStatusStore = useDeploymentStatusStore();
const queryFeeStore = useQueryFeesStore();
accountStore.fetchData();
const subgraphSettingStore = useSubgraphSettingStore();
import BigNumber from "bignumber.js";
import { calculateNewApr, calculateSubgraphDailyRewards, maxAllo, indexerCut } from '@/plugins/commonCalcs';
import { upgradeIndexerClient } from '@/plugins/upgradeIndexerClient';

const notificationStore = useNotificationStore();
const { getDeploymentStatuses } = storeToRefs(deploymentStatusStore);

const SUBGRAPH_QUERY = GET_SUBGRAPHS;
const SUBGRAPH_QUERY_NO_NETWORK_FILTER = GET_SUBGRAPHS_NO_NETWORK_FILTER;

export const useSubgraphsStore = defineStore({
  id: 'subgraphs',
  state: () => ({
    subgraphs: [],
    selected: [],
    loading: false,
    upgradeIndexer: [],
    error: false,
  }),
  getters: {
    loadingAll: (state) =>{
      return state.loading || deploymentStatusStore.loading || queryFeeStore.loading;
    },
    getFilteredSubgraphs: (state) => {
      const subgraphs = state.getSubgraphs;
      const settings = subgraphSettingStore.settings;

      // Pre-compute all filter parameters once
      const noRewardsFilter = settings.noRewardsFilter;
      const networkFilterArr = settings.networkFilter;
      const hasNetworkFilter = networkFilterArr.length > 0;
      const networkFilterSet = hasNetworkFilter ? new Set(networkFilterArr) : null;

      const useBlacklist = settings.activateBlacklist;
      const blacklistSet = useBlacklist ? new Set(subgraphSettingStore.combinedBlacklist) : null;

      const useSynclist = settings.activateSynclist;
      const synclistSet = useSynclist ? new Set(
        Array.isArray(settings.subgraphSynclist)
          ? settings.subgraphSynclist
          : (settings.subgraphSynclist || '').split('\n').map(l => l.trim()).filter(Boolean)
      ) : null;

      const maxSignalRaw = parseInt(settings.maxSignal);
      const maxSignalWei = maxSignalRaw ? new BigNumber(toWei(settings.maxSignal)) : null;
      const minSignalRaw = parseInt(settings.minSignal);
      const minSignalWei = minSignalRaw ? new BigNumber(toWei(settings.minSignal)) : null;

      const statusFilter = settings.statusFilter;
      const useStatusFilter = statusFilter !== 'none';
      const depStatuses = useStatusFilter ? deploymentStatusStore.getDeploymentStatuses : null;

      const hideAllocated = settings.hideCurrentlyAllocated === true;
      const hideZeroApr = settings.hideZeroApr;

      // Single-pass filter
      return subgraphs.filter((item) => {
        // Denied filter
        if (noRewardsFilter === 0 && item.deployment.deniedAt) return false;
        if (noRewardsFilter === 2 && !item.deployment.deniedAt) return false;

        // Network filter
        if (hasNetworkFilter) {
          if (!item.deployment.manifest.network || !networkFilterSet.has(item.deployment.manifest.network)) return false;
        }

        const ipfsHash = item.deployment.ipfsHash;

        // Blacklist
        if (useBlacklist && blacklistSet.has(ipfsHash)) return false;

        // Synclist
        if (useSynclist && !synclistSet.has(ipfsHash)) return false;

        // Max signal
        if (maxSignalWei && !BigNumber(item.deployment.signalledTokens).isLessThanOrEqualTo(maxSignalWei)) return false;

        // Min signal
        if (minSignalWei && !BigNumber(item.deployment.signalledTokens).isGreaterThanOrEqualTo(minSignalWei)) return false;

        // Status filter (inline the logic to avoid function call overhead per item)
        if (useStatusFilter) {
          const status = depStatuses[ipfsHash];
          switch (statusFilter) {
            case 'all':
              if (status == undefined) return false; break;
            case 'closable':
              if (!(status != undefined && status.synced === true && (status.fatalError == undefined || status.fatalError.deterministic === true))) return false; break;
            case 'healthy-synced':
              if (!(status != undefined && status.health === 'healthy' && status.synced === true)) return false; break;
            case 'syncing':
              if (!(status != undefined && status.health === 'healthy' && status.synced === false)) return false; break;
            case 'failed':
              if (!(status != undefined && status.health === 'failed')) return false; break;
            case 'non-deterministic':
              if (!(status != undefined && status.health === 'failed' && status.fatalError != undefined && status.fatalError.deterministic === false)) return false; break;
            case 'deterministic':
              if (!(status != undefined && status.health === 'failed' && status.fatalError != undefined && status.fatalError.deterministic === true)) return false; break;
          }
        }

        // Hide currently allocated
        if (hideAllocated && item.currentlyAllocated) return false;

        // Hide zero APR
        if (hideZeroApr && item.apr <= 0) return false;

        return true;
      });
    },
    getSubgraphs: (state) => {
      const len = state.subgraphs.length;
      if (len === 0) return [];

      // Pre-build Maps for O(1) lookups
      const alloMap = new Map();
      for (const a of allocationStore.getAllocations) {
        alloMap.set(a.subgraphDeployment.ipfsHash, a);
      }
      const selectedAlloMap = new Map();
      for (const a of allocationStore.getSelectedAllocations) {
        selectedAlloMap.set(a.subgraphDeployment.ipfsHash, a);
      }

      // Pre-compute constants
      const totalSignalled = networkStore.getTotalTokensSignalled;
      const totalAllocated = networkStore.getTotalTokensAllocated;
      const newAprCalc = subgraphSettingStore.newAprCalc;
      const newAllocation = subgraphSettingStore.settings.newAllocation;
      const newAllocationWei = newAprCalc ? toWei(newAllocation) : null;
      const targetApr = subgraphSettingStore.settings.targetApr;
      const accountLoading = accountStore.loading;
      const cut = accountStore.cut;
      const depStatuses = deploymentStatusStore.getDeploymentStatuses;
      const blankStatus = deploymentStatusStore.getBlankStatus;
      const queryFeeDict = queryFeeStore.getQueryFeeDict;
      const depEntities = deploymentStatusStore.getDeploymentEntities;

      const subgraphs = new Array(len);
      for (let i = 0; i < len; i++) {
        const sub = state.subgraphs[i];
        const ipfsHash = sub.deployment.ipfsHash;
        const signalled = sub.deployment.signalledTokens;
        const staked = sub.deployment.stakedTokens;

        // Proportion
        const proportion = staked > 0
          ? (signalled / totalSignalled) / (staked / totalAllocated)
          : 0;

        // APR
        const apr = signalled > 0
          ? calculateNewApr(signalled, staked, networkStore, "0", "0")
          : 0;

        // Future staked tokens (accounting for closing allocations)
        const closingAllo = selectedAlloMap.get(ipfsHash);
        const futureStaked = closingAllo
          ? new BigNumber(staked).minus(closingAllo.allocatedTokens)
          : new BigNumber(staked);

        // New APR
        const newApr = newAprCalc && signalled > 0
          ? calculateNewApr(signalled, futureStaked, networkStore, newAllocation, newAllocationWei)
          : 0;

        // Daily rewards
        const dailyRewards = signalled > 0
          ? calculateSubgraphDailyRewards(signalled, futureStaked, networkStore, newAllocation, newAllocationWei)
          : 0;

        // Daily rewards cut
        const dailyRewardsCut = staked > 0 && !accountLoading
          ? indexerCut(dailyRewards, cut)
          : 0;

        // Max allocation
        const maxAlloVal = signalled > 0
          ? maxAllo(targetApr, signalled, networkStore, futureStaked)
          : Number.MIN_SAFE_INTEGER;

        // Currently allocated (allocated but not selected for closing)
        const hasAllo = alloMap.has(ipfsHash);
        const hasUnallo = selectedAlloMap.has(ipfsHash);
        const currentlyAllocated = hasAllo && !hasUnallo;

        // Deployment status
        const deploymentStatus = depStatuses[ipfsHash] || blankStatus;

        // Query fees
        const queryFees = queryFeeDict[ipfsHash];

        // Num entities
        const numEntities = depEntities[ipfsHash] || null;

        // Upgrade indexer
        const upgradeIndexerVal = state.upgradeIndexer[i];

        subgraphs[i] = {
          ...sub,
          proportion,
          apr,
          newApr,
          dailyRewards,
          dailyRewardsCut,
          maxAllo: maxAlloVal,
          currentlyAllocated,
          deploymentStatus,
          upgradeIndexer: upgradeIndexerVal,
          numEntities,
          futureStakedTokens: futureStaked,
        };
        if (queryFees) subgraphs[i].queryFees = queryFees;
      }
      return subgraphs;
    },
    getSelectedSubgraphs: (state) => {
      // Build index map for O(1) lookup
      const indexMap = new Map();
      for (let i = 0; i < state.subgraphs.length; i++) {
        indexMap.set(state.subgraphs[i].deployment.ipfsHash, i);
      }

      const computed = state.getSubgraphs;
      const selectedSubgraphs = [];
      for (let i = 0; i < state.selected.length; i++) {
        const idx = indexMap.get(state.selected[i]);
        if (idx != null) {
          selectedSubgraphs[i] = computed[idx];
        }
      }
      return selectedSubgraphs;
    },
    getDataDict: (state) => {
      let dict = {};
      state.subgraphs.forEach(
        (el) => (dict[el.deployment.ipfsHash] = el)
      );
      return dict;
    },
    getSubgraphsDict: (state) => {
      let dict = {};
      state.getSubgraphs.forEach(
        (el) => (dict[el.deployment.ipfsHash] = el )
      );
      return dict;
    },
    getQueryFeeDash: (state) => {
      return queryFeeStore.queryFeeData.filter((e) => state.getSubgraphsDict[e.subgraphDeployment.id]).map((e) => Object.assign({}, e, state.getSubgraphsDict[e.subgraphDeployment.id] || {} ));
    },
    getSubgraphNetworks: (state) => {
      let networks = [];
      for(let i = 0; i < state.subgraphs.length; i++){
        if(state.subgraphs[i]?.deployment?.manifest?.network && !networks.includes(state.subgraphs[i].deployment.manifest.network) && state.subgraphs[i].deployment.manifest.network != 'polygon'){
          networks.push(state.subgraphs[i].deployment.manifest.network);
        }
      }
      return networks;
    },
  },
  actions: {
    async fetchNumEntities(subgraphId){
      let subgraph = this.getSubgraphs.find(e => e.deployment?.ipfsHash == subgraphId);
      if(subgraph?.upgradeIndexer && !subgraph?.upgradeIndexer?.loading && !subgraph?.upgradeIndexer?.loaded){
        subgraph.upgradeIndexer.loading = true;

        upgradeIndexerClient.query({
          query: gql`query  indexingStatuses($subgraphs: String!){
            indexingStatuses(subgraphs: [$subgraphs]){
              subgraph
              synced
              health
              entityCount
              fatalError {
                handler
                message
                deterministic
                block {
                  hash
                  number
                }
              }
              chains {
                network
                chainHeadBlock {
                  number
                  hash
                }
                earliestBlock {
                  number
                  hash
                }
                latestBlock {
                  number
                  hash
                }
                lastHealthyBlock {
                  hash
                  number
                }
              }
              node
            }
          }`,
          variables: {
            subgraphs: subgraph.deployment?.ipfsHash,
          }
        })
        .then((data) => {
            if(data.data?.indexingStatuses[0]?.entityCount)
            subgraph.upgradeIndexer.value = data.data.indexingStatuses[0].entityCount;
          subgraph.upgradeIndexer.loaded = true;
          subgraph.upgradeIndexer.loading = false;
        });
      }
      
    },
    async fetch(cursor = "0"){
      return chainStore.getNetworkSubgraphClient.query({
        query: subgraphSettingStore.settings.queryFilters.networkFilter.length == 0 ? SUBGRAPH_QUERY_NO_NETWORK_FILTER : SUBGRAPH_QUERY,
        variables: {
          cursor: cursor,
          minSignal: toWei(subgraphSettingStore.settings.queryFilters.minSignal || "0").toString(),
          networks: subgraphSettingStore.settings.queryFilters.networkFilter,
        },
      })
      .then(({ data, networkStatus }) => {
        if(networkStatus == 7 && data.subgraphDeploymentManifests.length == 1000){
          return this.fetch(data.subgraphDeploymentManifests[data.subgraphDeploymentManifests.length-1].id)
          .then((data1) => {
            let concatData = {};
            if(typeof data.subgraphDeploymentManifests == "object" && typeof data1.subgraphDeploymentManifests == "object")
            concatData.subgraphDeploymentManifests = data.subgraphDeploymentManifests.concat(data1.subgraphDeploymentManifests);
            
            return concatData;
          })
        }
        
        return data;
      }).catch((err) => {
        this.loading = false;
        if(err.graphQLErrors[0]?.message){
          console.error(`Subgraphs API error: ${err.graphQLErrors[0].message}`)
          if(!this.error){
            notificationStore.error(`Subgraphs API Error: ${err.graphQLErrors[0].message}`);
            this.error = true;
          }
        }
        if(err.message){
          console.error(`Subgraphs query error: ${err.message}`);
          if(!this.error){
            notificationStore.error(`Subgraphs Error: ${err.message}`);
            this.error = true;
          }
        }
      });
    },
    async fetchData(){
      return networkStore.init().then(() => {
        this.error = false;
        this.loading = true;
        const subgraphData = this.fetch()
          .then((data) => {
            // let uniqueSubgraphs = []
            // let subgraphs = [];
            // for(let i = 0; i < data.subgraphDeploymentManifests.length; i++){
            //   if(data.subgraphDeploymentManifests[i].deployment?.ipfsHash && !uniqueSubgraphs.includes(data.subgraphDeploymentManifests[i].deployment?.ipfsHash)){
            //     uniqueSubgraphs.push(data.subgraphDeploymentManifests[i].deployment.ipfsHash);
            //     subgraphs.push(data.subgraphDeploymentManifests[i]);
            //   }
            // }
            this.subgraphs = data.subgraphDeploymentManifests;
            this.upgradeIndexer = Array(data.subgraphDeploymentManifests.length).fill();
            for(let i = 0; i < this.upgradeIndexer.length; i++){
              this.upgradeIndexer[i] = { value: "0", loading: false, loaded: false };
            }
            return this.subgraphs;
          });

        const queryFeeData = queryFeeStore.fetchData();

        return Promise.all([subgraphData, queryFeeData]).then(() => {
          this.loading = false;
        });
      });
      
      
    },
    async refreshSubgraphs(){
      this.selected = [];
      this.fetchData();
    },
  }
})
