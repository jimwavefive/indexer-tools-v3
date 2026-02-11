import { defineStore } from 'pinia'
import { useNetworkStore } from '@/store/network';
import { useAccountStore } from '@/store/accounts';
import { useChainStore } from '@/store/chains';
import { useDeploymentStatusStore } from './deploymentStatuses';
import { useNotificationStore } from './notifications';
import { GET_ALLOCATIONS } from '@indexer-tools/shared/graphql/allocations';
import gql from 'graphql-tag';
import BigNumber from 'bignumber.js';
import { storeToRefs } from 'pinia';
import { calculateApr, calculateReadableDuration, calculateAllocationDailyRewards, indexerCut } from '@/plugins/commonCalcs';
import { useSubgraphSettingStore } from './subgraphSettings';
import { useQosStore } from './qos';
import { useQueryFeesStore } from './queryFees';
import { useChainValidationStore } from './chainValidation';
import { useEpochStore } from './epochStore';
import { applyStatusFilter } from '@/plugins/statusFilters';

const networkStore = useNetworkStore();
const accountStore = useAccountStore();
const chainStore = useChainStore();
const deploymentStatusStore = useDeploymentStatusStore();
const subgraphSettingStore = useSubgraphSettingStore();
const qosStore = useQosStore();
const queryFeeStore = useQueryFeesStore();
const chainValidation = useChainValidationStore();
const epochStore = useEpochStore();
const notificationStore = useNotificationStore();

networkStore.init();
accountStore.fetchData()
.then(() => {
  deploymentStatusStore.init();
});
epochStore.init();
chainValidation.init();


export const useAllocationStore = defineStore('allocationStore', {
  state: () => ({
    allocations: [],
    pendingRewards: [],
    selected: [],
    loaded: false,
    loading: false,
    activateSynclist: false,
    activateBlacklist: false,
    networkFilter: [],
    minEpochDuration: 0,
    error: false,
  }),
  getters: {
    loadingAll: (state) => {
      return state.loading || deploymentStatusStore.loading || qosStore.loading || queryFeeStore.loading
    },
    getFilteredAllocations: (state) => {
      let allocations = state.getAllocations;
      
      allocations = applyStatusFilter(
        allocations,
        subgraphSettingStore.settings.statusFilter,
        deploymentStatusStore.getDeploymentStatuses,
        (i) => i.subgraphDeployment.ipfsHash
      );

      // Blacklist Filter
      if(state.activateBlacklist) {
        const blacklist = subgraphSettingStore.combinedBlacklist;
        allocations = allocations.filter((i) => {
          return !blacklist.includes(i.subgraphDeployment.ipfsHash);
        });
      }

      // Synclist Filter
      if(state.activateSynclist) {
        allocations = allocations.filter((i) => {
          return subgraphSettingStore.settings.subgraphSynclist.includes(i.subgraphDeployment.ipfsHash);
        });
      }

      // Network Filter
      if(state.networkFilter.length) {
        allocations = allocations.filter((i) => {
          return i.subgraphDeployment.manifest?.network && state.networkFilter.includes(i.subgraphDeployment.manifest.network);
        });
      }

      // Min Epoch Duration Filter
      if(state.minEpochDuration > 0) {
        allocations = allocations.filter(a => a.epochDuration >= state.minEpochDuration);
      }

      return allocations;
    },
    getSelectedFilteredAllocations: (state) => {
      let allocations = [];
      for(let i = 0; i < state.selected.length; i++){
        let allocation = state.getFilteredAllocations.find((e) => e.id == state.selected[i]);
        if(allocation){
          allocations[i] = {
            ...allocation,
          }
        }
      }
      return allocations;
    },
    getAllocations: (state) => {
      const len = state.allocations.length;
      if (len === 0) return [];

      // Pre-compute constants
      const totalSignalled = networkStore.getTotalTokensSignalled;
      const totalAllocated = networkStore.getTotalTokensAllocated;
      const currentEpoch = networkStore.getCurrentEpoch;
      const accountLoading = accountStore.loading;
      const cut = accountStore.cut;
      const poiQueryStatus = accountStore.getPOIQueryStatus;
      const depStatuses = deploymentStatusStore.getDeploymentStatuses;
      const blankStatus = deploymentStatusStore.getBlankStatus;
      const depFailures = deploymentStatusStore.getDeploymentFailures;
      const qosDict = qosStore.getQosDict;
      const queryFeeDict = queryFeeStore.getQueryFeeDict;
      const chainStatus = chainValidation.getChainStatus;
      const blockNumbers = epochStore.getBlockNumbers;
      const nowSec = Math.floor(Date.now() / 1000);

      const allocations = new Array(len);
      for (let i = 0; i < len; i++) {
        const allo = state.allocations[i];
        const ipfsHash = allo.subgraphDeployment.ipfsHash;
        const signalled = allo.subgraphDeployment.signalledTokens;
        const staked = allo.subgraphDeployment.stakedTokens;
        const network = allo.subgraphDeployment.manifest?.network;

        // Duration
        const activeDuration = nowSec - allo.createdAt;
        const readableDuration = calculateReadableDuration(activeDuration);
        const epochDuration = currentEpoch - allo.createdAtEpoch;

        // Proportion
        const proportion = staked > 0
          ? (signalled / totalSignalled) / (staked / totalAllocated)
          : 0;

        // APR
        const apr = staked > 0
          ? calculateApr(signalled, staked, networkStore).toString()
          : 0;

        // Daily rewards
        const dailyRewards = staked > 0
          ? calculateAllocationDailyRewards(signalled, staked, allo.allocatedTokens, networkStore)
          : 0;

        // Daily rewards cut
        const dailyRewardsCut = staked > 0 && !accountLoading
          ? indexerCut(dailyRewards, cut)
          : 0;

        // Pending rewards
        const pendingRewardsData = state.pendingRewards[i] || { value: BigNumber(0), loading: false, loaded: false };

        // Pending rewards cut
        const pendingRewardsCut = pendingRewardsData.value > 0 && !accountLoading
          ? indexerCut(pendingRewardsData.value, cut)
          : BigNumber(0);

        // Deployment status
        const deploymentStatus = depStatuses[ipfsHash] || blankStatus;

        // QoS
        const qos = qosDict[ipfsHash];

        // Query fees
        const queryFees = queryFeeDict[ipfsHash];

        // Status checks
        const validChain = poiQueryStatus ? chainStatus[network] : null;
        const synced = blockNumbers[network] <= deploymentStatus?.chains?.[0]?.latestBlock?.number;
        const deterministicFailure = synced ? null : deploymentStatus?.health == 'failed' && deploymentStatus?.fatalError && deploymentStatus?.fatalError?.deterministic == true;
        const otherIndexerStatus = depFailures[ipfsHash];
        const statusChecks = {
          synced,
          deterministicFailure,
          healthComparison: otherIndexerStatus?.healthy > otherIndexerStatus?.failed,
          validChain,
          healthyCount: otherIndexerStatus?.healthy,
          failedCount: otherIndexerStatus?.failed,
        };

        allocations[i] = {
          ...allo,
          activeDuration,
          readableDuration,
          epochDuration,
          proportion,
          apr,
          dailyRewards,
          dailyRewardsCut,
          pendingRewards: pendingRewardsData,
          pendingRewardsCut,
          deploymentStatus,
          statusChecks,
        };
        if (qos) allocations[i].qos = qos;
        if (queryFees) allocations[i].queryFees = queryFees;
      }
      return allocations;
    },
    getSelectedAllocations: (state) => {
      // Build Map for O(1) lookup
      const alloMap = new Map();
      for (const a of state.allocations) {
        alloMap.set(a.id, a);
      }
      const allocations = [];
      for (let i = 0; i < state.selected.length; i++) {
        const allocation = alloMap.get(state.selected[i]);
        if (allocation) {
          allocations[i] = { ...allocation };
        }
      }
      return allocations;
    },
    getSubgraphNetworks: (state) => {
      let networks = ["mainnet","arbitrum-one","matic"];
      for(let i = 0; i < state.allocations.length; i++){
        if(state.allocations[i]?.subgraphDeployment?.manifest?.network && !networks.includes(state.allocations[i].subgraphDeployment.manifest.network) && state.allocations[i].subgraphDeployment.manifest.network != 'polygon'){
          networks.push(state.allocations[i].subgraphDeployment.manifest.network);
        }
      }
      return networks;
    },
    totalAllocatedStake: (state) => {
      let totalAllocatedStake = new BigNumber(0);
      if(state.allocations.length > 0){
        for(const i in state.allocations){
          totalAllocatedStake = totalAllocatedStake.plus(state.allocations[i].allocatedTokens);
        }
      }
      return totalAllocatedStake;
    },
    totalRewardsPerYear: (state) => {
      let totalRewardsPerYear = new BigNumber(0);
      if(state.allocations.length > 0){
        for(const i in state.allocations){
          if(!new BigNumber(state.allocations[i].allocatedTokens).isEqualTo(new BigNumber(0)) && !new BigNumber(state.allocations[i].subgraphDeployment.signalledTokens).isEqualTo(new BigNumber(0)) && !state.allocations[i].subgraphDeployment.deniedAt){
            totalRewardsPerYear = totalRewardsPerYear.plus(
                new BigNumber(state.allocations[i].subgraphDeployment.signalledTokens)
                    .dividedBy(networkStore.getTotalTokensSignalled)
                    .multipliedBy(networkStore.getIssuancePerYear)
                    .multipliedBy(
                        new BigNumber(state.allocations[i].allocatedTokens).dividedBy(state.allocations[i].subgraphDeployment.stakedTokens)
                    )
            );
          }
        }
      }
      return totalRewardsPerYear;
    },
    avgAPR: (state) => {
      return state.totalRewardsPerYear.dividedBy(state.totalAllocatedStake.plus(accountStore.availableStake));
    },
    calculatedClosingRewardsPerYear: (state) => {
      let totalRewardsPerYear = new BigNumber(0);
      if(state.selected.length > 0){
        const alloMap = new Map();
        for (const a of state.allocations) alloMap.set(a.id, a);
        for(const id of state.selected){
          let allocation = alloMap.get(id);
          if(allocation && !allocation.subgraphDeployment.deniedAt){
            totalRewardsPerYear = totalRewardsPerYear.plus(
              new BigNumber(allocation.subgraphDeployment.signalledTokens)
                  .dividedBy(networkStore.getTotalTokensSignalled)
                  .multipliedBy(networkStore.getIssuancePerYear)
                  .multipliedBy(
                      new BigNumber(allocation.allocatedTokens).dividedBy(allocation.subgraphDeployment.stakedTokens)
                  )
            );
          }
        }
      }
      return totalRewardsPerYear;
    },
    calculatedClosingStake: (state) => {
      let totalAllocatedStake = new BigNumber(0);
      if(state.selected.length > 0){
        const alloMap = new Map();
        for (const a of state.allocations) alloMap.set(a.id, a);
        for(const id of state.selected){
          const allo = alloMap.get(id);
          if (allo) totalAllocatedStake = totalAllocatedStake.plus(allo.allocatedTokens);
        }
      }
      return totalAllocatedStake;
    },
    closingAvgAPR: (state) => {
      return state.calculatedClosingRewardsPerYear.dividedBy(state.calculatedClosingStake);
    },
    pendingRewardsCutSum: (state) => {
      return state.getAllocations.reduce((sum, cur) => cur.pendingRewardsCut && !cur.subgraphDeployment.deniedAt ? sum.plus(cur.pendingRewardsCut): sum, new BigNumber(0));
    },
    pendingRewardsSum: (state) => {
      return state.getAllocations.reduce((sum, cur) => cur.pendingRewards.loaded && !cur.subgraphDeployment.deniedAt ? sum.plus(cur.pendingRewards.value) : sum, new BigNumber(0));
    },
    dailyRewardsCutSum: (state) => {
      return state.getAllocations.reduce((sum, cur) => cur.subgraphDeployment.deniedAt ? sum : sum.plus(cur.dailyRewardsCut), new BigNumber(0));
    },
    dailyRewardsSum: (state) => {
      return state.getAllocations.reduce((sum, cur) => cur.subgraphDeployment.deniedAt ? sum : sum.plus(cur.dailyRewards), new BigNumber(0));
    },
  },
  actions: {
    async fetchAllPendingRewards(){
      for(let i = 0; i < this.getAllocations.length; i++){
        let allocation = this.getAllocations[i];
        if(!allocation.pendingRewards.loading && !allocation.pendingRewards.loaded)
          allocation.pendingRewards.loading = true;
      }
      let y = 0;
      while(y < this.getAllocations.length){
        const max = y + 50 < this.getAllocations.length ? y + 50 : this.getAllocations.length;
        const promises = [];
        const indices = [];
        for(let i = y; i < max; i++){
          let allocation = this.getAllocations[i];
          const issuer = allocation.isLegacy ? "0x00669A4CF01450B64E8A2A20E9b1FCB71E61eF03" : "0xb2Bb92d0DE618878E438b55D5846cfecD9301105";

          if(allocation.pendingRewards.loading && !allocation.pendingRewards.loaded){
            promises.push(
              chainStore.getRewardsContract.getRewards(issuer, allocation.id)
                .then(value => {
                  if(value != undefined){
                    allocation.pendingRewards.value = BigNumber(value.toString());
                    allocation.pendingRewards.loaded = true;
                  }
                  allocation.pendingRewards.loading = false;
                })
                .catch(() => {
                  allocation.pendingRewards.loading = false;
                })
            );
            indices.push(i);
          }
        }
        await Promise.all(promises);

        y = y + 50 < this.getAllocations.length ? y + 50 : this.getAllocations.length;
        if(y < this.getAllocations.length - 1){
            await new Promise(r => setTimeout(r, 1500));
        }
      }
    },
    async fetchPendingRewards(allocationId){
      let allocation = this.getAllocations.find(e => e.id == allocationId);
      const issuer = allocation.isLegacy ? "0x00669A4CF01450B64E8A2A20E9b1FCB71E61eF03" : "0xb2Bb92d0DE618878E438b55D5846cfecD9301105";

      if(!allocation.pendingRewards.loading && !allocation.pendingRewards.loaded){
        allocation.pendingRewards.loading = true;

        try {
          const value = await chainStore.getRewardsContract.getRewards(issuer, allocation.id);
          if(value != undefined){
            allocation.pendingRewards.value = BigNumber(value.toString());
            allocation.pendingRewards.loaded = true;
          }
        } catch(e) {
          // silently fail
        }
        allocation.pendingRewards.loading = false;
      }
    },
    async init(){
      if(!this.loaded && !this.loading)
        return this.fetchData();
    },
    async fetchData(){
      this.error = false;
      this.loading = true;
      const fetch = networkStore.init().then(() => {
        this.fetch(0)
        .then((data) => {
          this.allocations = data.allocations;
          this.pendingRewards = Array(data.allocations.length).fill();
          for(let i = 0; i < this.pendingRewards.length; i++){
            this.pendingRewards[i] = { value: BigNumber(0), loading: false, loaded: false };
          }
          return this.allocations;
        });
      });
      const qos = qosStore.fetchData();
      const queryFees = queryFeeStore.fetchData();
      return Promise.all([fetch, qos, queryFees]).then(() => {
        this.loaded = true;
        this.loading = false;
      });
    },
    async fetch(skip){
      this.selected = [];
      return chainStore.getNetworkSubgraphClient.query({
        query: GET_ALLOCATIONS,
        variables: {
          indexer: accountStore.getActiveAccount.address,
          skip: skip
        },
      })
      .then(({ data, networkStatus }) => {
        if(networkStatus == 7 && data.allocations.length == 1000){
          return this.fetch(skip + data.allocations.length)
          .then((data1) => {
            let concatData = {};
            if(typeof data.allocations == "object" && typeof data1.allocations == "object")
              concatData.allocations = data.allocations.concat(data1.allocations);
            
            return concatData;
          })
        }
        return data;
      }).catch((err) => {
        this.loading = false;
        if(err.graphQLErrors[0]?.message){
          console.error(`Allocations API error: ${err.graphQLErrors[0].message}`)
          if(!this.error){
            notificationStore.error(`Allocations API Error: ${err.graphQLErrors[0].message}`);
            this.error = true
          }
        }
        if(err.message){
          console.error(`Allocations query error: ${err.message}`);
          if(!this.error){
            notificationStore.error(`Allocations Error: ${err.message}`);
            this.error = true
          }
        }
      });
    }
  }
})
