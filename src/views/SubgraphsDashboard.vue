<template>
  <v-data-table
    :headers="subgraphSettingStore.settings.selectedSubgraphColumns"
    :items="subgraphStore.getFilteredSubgraphs"
    item-value="deployment.ipfsHash"
    class="elevation-1"
    loading-text="Loading... Please wait"
    mobile-breakpoint="0"
    :show-select="selectable"
    v-model="selected"
    v-model:sort-by="tableSettingsStore.subgraphSettings.sortBy"
    v-model:loading="subgraphStore.loadingAll"
    v-model:items-per-page="tableSettingsStore.subgraphSettings.itemsPerPage"
    :search="search"
    hover
  >
    <template v-slot:no-data>
      <p class="mt-4">
        No data available
      </p>
      <br>
      <v-btn
        rounded
        variant="text"
        @click="resetFilters()"
        class="mb-4 mt-2"
      >
        Reset Filters
      </v-btn>
    </template>
    <template v-slot:top>
      <div class="d-flex align-content-center">
        <v-btn text="Refresh Subgraphs" prepend-icon="mdi-refresh" @click="subgraphStore.refreshSubgraphs()" class="mx-5 my-6" stacked></v-btn>
        <v-btn text="Export CSV" prepend-icon="mdi-download" @click="exportSubgraphs" class="mx-2 my-6" variant="tonal" stacked></v-btn>
        <div class="d-flex align-content-center align-center">
          <v-expansion-panels class="">
            <v-expansion-panel
              title="Subgraph Query Filters"
            >
              <v-expansion-panel-text>
                <v-text-field
                    v-model="subgraphSettingStore.settings.queryFilters.minSignal"
                    type="number"
                    label="Min Signal"
                    class="d-inline-block mx-4"
                    style="max-width:15rem"
                ></v-text-field>
                <v-combobox
                    v-model="subgraphSettingStore.settings.queryFilters.networkFilter"
                    :items="networks"
                    label="Subgraph Networks"
                    multiple
                    chips
                    clearable
                    class="d-inline-block mx-4"
                    style="min-width:13rem;max-width: 15rem;top: -5px"
                ></v-combobox>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </div>
      <v-row class="mx-2 mt-1" align="center" dense>
        <v-col cols="auto">
          <v-text-field v-model="search" label="Search" style="width:11rem"
            density="compact" hide-details></v-text-field>
        </v-col>
        <v-col cols="auto">
          <v-text-field v-model="subgraphSettingStore.settings.minSignal"
            type="number" label="Min Signal" style="width:9rem"
            density="compact" hide-details hide-spin-buttons></v-text-field>
        </v-col>
        <v-col cols="auto">
          <v-text-field v-model="subgraphSettingStore.settings.maxSignal"
            type="number" label="Max Signal" style="width:9rem"
            density="compact" hide-details hide-spin-buttons></v-text-field>
        </v-col>
        <v-col cols="auto" v-if="subgraphSettingStore.newAprCalc">
          <v-confirm-edit v-model="subgraphSettingStore.settings.newAllocation">
            <template v-slot:default="{ model: proxyModel, save, cancel, isPristine, actions}">
              <v-text-field v-model="proxyModel.value" type="number" label="New Allocation"
                style="width:10rem" density="compact" hide-details hide-spin-buttons
                :append-inner-icon="isPristine ? '' : 'mdi-check'"
                :clear-icon="isPristine ? '' : 'mdi-undo-variant'"
                @click:append-inner="save" @click:clear="cancel" @keydown.enter="save"
                clearable></v-text-field>
              <component :is="actions" v-if="false"></component>
            </template>
          </v-confirm-edit>
        </v-col>
        <v-col cols="auto">
          <v-confirm-edit v-model="subgraphSettingStore.settings.targetApr">
            <template v-slot:default="{ model: proxyModel, save, cancel, isPristine, actions}">
              <v-text-field v-model="proxyModel.value" type="number" label="Target APR"
                style="width:12rem" density="compact" hide-details hide-spin-buttons
                :append-inner-icon="isPristine ? '' : 'mdi-check'"
                :clear-icon="isPristine ? '' : 'mdi-undo-variant'"
                @click:append-inner="save" @click:clear="cancel" @keydown.enter="save"
                clearable :disabled="autoTargetApr"></v-text-field>
              <component :is="actions" v-if="false"></component>
            </template>
          </v-confirm-edit>
        </v-col>
        <v-col cols="auto">
          <v-switch v-model="autoTargetApr" label="Auto" density="compact" hide-details
            color="success" @update:model-value="onAutoTargetAprToggle"></v-switch>
        </v-col>
        <v-col cols="auto" v-if="autoTargetApr">
          <v-text-field v-model="newAllocationSetterStore.reserveGRT"
            type="number" label="Reserve GRT" style="width:9rem"
            density="compact" hide-details hide-spin-buttons
            @update:model-value="applyAutoTargetApr"></v-text-field>
        </v-col>
        <v-col cols="auto">
          <v-select v-model="subgraphSettingStore.settings.noRewardsFilter"
            :items="[{text: 'Exclude Denied', action: 0}, {text:'Include Denied', action: 1}, {text: 'Only Denied', action: 2}]"
            item-title="text" item-value="action" label="Denied Rewards"
            style="width:12rem" density="compact" hide-details></v-select>
        </v-col>
      </v-row>
      <v-row class="mx-2" align="center" dense>
        <v-col cols="auto">
          <v-combobox v-model="subgraphSettingStore.settings.networkFilter"
            :items="subgraphStore.getSubgraphNetworks" label="Subgraph Networks"
            multiple chips clearable style="width:14rem"
            density="compact" hide-details></v-combobox>
        </v-col>
        <v-col cols="auto">
          <v-select v-model="subgraphSettingStore.settings.statusFilter"
            :items="[{title:'No Filter', value:'none'},{title:'All Reported Status', value:'all'},{title:'Closable', value:'closable'},{title: 'Healthy/Synced', value:'healthy-synced'},{title:'Syncing', value:'syncing'},{title:'Failed', value:'failed'},{title:'Non-Deterministic', value:'non-deterministic'},{title:'Deterministic', value:'deterministic'}]"
            label="Status Filter" style="width:13rem"
            density="compact" hide-details></v-select>
        </v-col>
        <v-col cols="auto">
          <v-checkbox v-model="subgraphSettingStore.settings.activateBlacklist"
            label="Blacklist" density="compact" hide-details></v-checkbox>
        </v-col>
        <v-col cols="auto">
          <v-checkbox v-model="subgraphSettingStore.settings.activateSynclist"
            label="Synclist" density="compact" hide-details></v-checkbox>
        </v-col>
        <v-col cols="auto">
          <v-checkbox v-model="subgraphSettingStore.settings.hideCurrentlyAllocated"
            label="Hide Currently Allocated" density="compact" hide-details></v-checkbox>
        </v-col>
      </v-row>
    </template>
    <template v-slot:item.deploymentStatus.blocksBehindChainhead="{ item }">
      <StatusDropdownVue :item='item' />
    </template>
    <template v-slot:item.deployment.createdAt="{ item }">
      <span :timestamp="item.deployment.createdAt">{{ format(new Date(Number(item.deployment.createdAt) * 1000), "MMM d, yyyy HH:mm") }}</span>
    </template>
    <template v-slot:item.proportion="{ item }">
      {{ numeral(item.proportion).format('0,0.0000') }}
    </template>
    <template v-slot:item.apr="{ item }">
      {{ numeral(item.apr).format('0,0.00') }}%
    </template>
    <template v-slot:item.newApr="{ item }">
        {{ numeral(item.newApr).format('0,0.00') }}%
      </template>
    <template v-slot:item.maxAllo="{ item }">
      <span v-if="item.maxAllo != Number.MIN_SAFE_INTEGER">{{ numeral(item.maxAllo).format('0,0') }} GRT</span>
      <span v-if="item.maxAllo == Number.MIN_SAFE_INTEGER">-</span>
    </template>
    <template v-slot:item.dailyRewards="{ item }">
      {{ numeral(fromWei(toBN(item.dailyRewards))).format('0,0') }} GRT
    </template>
    <template v-slot:item.dailyRewardsCut="{ item }">
      {{ numeral(fromWei(toBN(item.dailyRewardsCut))).format('0,0') }} GRT
    </template>
    <template v-slot:item.deployment.signalledTokens="{ item }">
      {{ numeral(fromWei(item.deployment.signalledTokens.toString())).format('0,0') }} GRT
    </template>
    <template v-slot:item.deployment.indexingRewardAmount="{ item }">
      {{ numeral(fromWei(item.deployment.indexingRewardAmount.toString())).format('0,0') }} GRT
    </template>
    <template v-slot:item.deployment.queryFeesAmount="{ item }">
      {{ numeral(fromWei(item.deployment.queryFeesAmount.toString())).format('0,0') }} GRT
    </template>
    <template v-slot:item.queryFees.query_count="{ item }">
      {{ item.queryFees?.query_count ? numeral(item.queryFees.query_count).format('0,0') : '-' }}
    </template>
    <template v-slot:item.queryFees.total_query_fees="{ item }">
      {{ item.queryFees?.total_query_fees ? numeral(item.queryFees.total_query_fees).format('0,0') : '-' }} GRT
    </template>
    <template v-slot:item.queryFees.avg_gateway_latency_ms="{ item }">
      {{ numeral(item.queryFees?.avg_gateway_latency_ms).format('0,0.00') }} ms
    </template>
    <template v-slot:item.queryFees.avg_query_fee="{ item }">
      {{ numeral(item.queryFees?.avg_query_fee).format('0,0.00000') }} GRT
    </template>
    <template v-slot:item.queryFees.gateway_query_success_rate="{ item }">
      {{ numeral(item.queryFees?.gateway_query_success_rate).format('0.00%') }}
    </template>
    <template v-slot:item.deployment.stakedTokens="{ item }">
      {{ numeral(fromWei(item.deployment.stakedTokens.toString())).format('0,0') }} GRT
    </template>
    <template v-slot:item.deployment.manifest.network="{ item }">
      {{ item.deployment.manifest.network ? item.deployment.manifest.network : "null" }}
    </template> 
    <template v-slot:item.upgradeIndexer="{ item }">
      <div 
       v-if="item.numEntities"
       class="d-flex"
      >
        <span>
          {{ numeral(item.numEntities).format('0,0') }} Entities
        </span>
      </div>
      <div 
       v-if="!item.numEntities"
       class="d-flex"
      >
        <span>
          ?
        </span>
      </div>
      
    </template>
  </v-data-table>
  
</template>

<script setup>
  import { ref, watch, nextTick, onUnmounted } from 'vue';
  import { useSubgraphsStore } from '@/store/subgraphs';
  import { useSubgraphSettingStore } from '@/store/subgraphSettings';
  import { useNewAllocationSetterStore } from '@/store/newAllocationSetter';
  import numeral from 'numeral';
  import { fromWei, toBN } from '@/plugins/web3Utils';
  import { format } from 'date-fns';
  import { storeToRefs } from 'pinia';
  import { useTableSettingStore } from "@/store/tableSettings";
  import StatusDropdownVue from '@/components/StatusDropdown.vue';
  import { networks } from '@/plugins/subgraphNetworks';
  import { exportToCsv } from '@/plugins/csvExport';
  import { useAppStore } from '@/store/app';


  const search = ref('');
  const subgraphStore = useSubgraphsStore();
  const subgraphSettingStore = useSubgraphSettingStore();
  const tableSettingsStore = useTableSettingStore();
  const newAllocationSetterStore = useNewAllocationSetterStore();
  const autoTargetApr = ref(false);
  subgraphStore.fetchData();

  function onAutoTargetAprToggle(enabled) {
    if (enabled) applyAutoTargetApr();
  }

  function applyAutoTargetApr() {
    const apr = newAllocationSetterStore.calculatedAutoTargetApr;
    if (apr.isGreaterThan(0)) {
      subgraphSettingStore.settings.targetApr = apr.toFixed(2);
      newAllocationSetterStore.setAllMaxAllos();
    }
  }

  watch(() => subgraphStore.selected, () => {
    if (autoTargetApr.value) {
      nextTick(() => applyAutoTargetApr());
    }
  }, { deep: true });

  const { selected } = storeToRefs(subgraphStore);

  defineProps({
    selectable: {
      type: Boolean,
      default: false,
    },
  })

  function resetFilters () {
    search.value = "";
    subgraphSettingStore.settings.minSignal = "";
    subgraphSettingStore.settings.maxSignal = "";
    subgraphSettingStore.settings.noRewardsFilter = 1;
    subgraphSettingStore.settings.networkFilter = [];
    subgraphSettingStore.settings.statusFilter = "none";
    subgraphSettingStore.settings.activateBlacklist = false;
    subgraphSettingStore.settings.activateSynclist = false;
    subgraphSettingStore.settings.hideCurrentlyAllocated = false;
  }

  function exportSubgraphs() {
    exportToCsv(
      subgraphSettingStore.settings.selectedSubgraphColumns,
      subgraphStore.getFilteredSubgraphs,
      'subgraphs.csv'
    );
  }

  const appStore = useAppStore();
  let autoRefreshTimer = null;

  function setupAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    if (appStore.autoRefreshInterval > 0) {
      autoRefreshTimer = setInterval(() => {
        subgraphStore.refreshSubgraphs();
      }, appStore.autoRefreshInterval);
    }
  }

  watch(() => appStore.autoRefreshInterval, setupAutoRefresh);
  setupAutoRefresh();
  onUnmounted(() => { if (autoRefreshTimer) clearInterval(autoRefreshTimer); });

</script>
