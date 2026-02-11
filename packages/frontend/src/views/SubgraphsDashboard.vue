<template>
  <div class="subgraphs-dashboard">
    <!-- Toolbar -->
    <div class="dashboard-toolbar">
      <Button
        label="Refresh"
        icon="pi pi-refresh"
        severity="secondary"
        :loading="isLoading"
        @click="refetch()"
      />
      <span class="subgraph-count" v-if="!isLoading">
        {{ filtered.length }} / {{ enriched.length }} subgraphs
      </span>
    </div>

    <!-- Filter bar row 1 -->
    <div class="filter-row">
      <div class="filter-item">
        <label>Search</label>
        <InputText
          v-model="settingsStore.state.search"
          placeholder="Name, ID, network..."
          style="width: 11rem"
        />
      </div>
      <div class="filter-item">
        <label>Min Signal</label>
        <InputText
          v-model="localMinSignal"
          type="number"
          style="width: 8rem"
        />
      </div>
      <div class="filter-item">
        <label>Max Signal</label>
        <InputText
          v-model="localMaxSignal"
          type="number"
          style="width: 8rem"
        />
      </div>
      <div class="filter-item" v-if="showNewAprColumn">
        <label>New Allocation</label>
        <InputText
          v-model="settingsStore.state.newAllocation"
          type="number"
          style="width: 9rem"
        />
      </div>
      <div class="filter-item">
        <label>Target APR</label>
        <InputText
          v-model="settingsStore.state.targetApr"
          type="number"
          style="width: 8rem"
        />
      </div>
      <div class="filter-item">
        <label>Denied Rewards</label>
        <Select
          v-model="settingsStore.state.noRewardsFilter"
          :options="deniedOptions"
          option-label="label"
          option-value="value"
          style="width: 11rem"
        />
      </div>
    </div>

    <!-- Filter bar row 2 -->
    <div class="filter-row">
      <div class="filter-item">
        <label>Networks</label>
        <MultiSelect
          v-model="settingsStore.state.networkFilter"
          :options="availableNetworks"
          placeholder="All networks"
          display="chip"
          style="width: 14rem"
        />
      </div>
      <div class="filter-item checkbox-item">
        <Checkbox v-model="settingsStore.state.activateBlacklist" :binary="true" input-id="bl" />
        <label for="bl">Blacklist</label>
      </div>
      <div class="filter-item checkbox-item">
        <Checkbox v-model="settingsStore.state.activateSynclist" :binary="true" input-id="sl" />
        <label for="sl">Synclist</label>
      </div>
      <div class="filter-item checkbox-item">
        <Checkbox v-model="settingsStore.state.hideCurrentlyAllocated" :binary="true" input-id="hca" />
        <label for="hca">Hide Allocated</label>
      </div>
      <div class="filter-item checkbox-item">
        <Checkbox v-model="settingsStore.state.hideZeroApr" :binary="true" input-id="hza" />
        <label for="hza">Hide 0% APR</label>
      </div>
      <div class="filter-item checkbox-item">
        <Checkbox v-model="settingsStore.state.limitToIndexerChains" :binary="true" input-id="lic" />
        <label for="lic">Limit GQL to Indexer's chains</label>
      </div>
    </div>

    <!-- Data table -->
    <SubgraphTable
      :data="filtered"
      :loading="isLoading"
      :table-height="tableHeight"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import Checkbox from 'primevue/checkbox';
import SubgraphTable from '../components/tables/SubgraphTable.vue';
import { useSubgraphs } from '../composables/queries/useSubgraphs';
import { useAllocations } from '../composables/queries/useAllocations';
import { useSettingsStore } from '../composables/state/useSettings';
import { useAutoRefresh } from '../composables/util/useAutoRefresh';

const settingsStore = useSettingsStore();

const { availableNetworks: indexerChains, allocatedDeployments } = useAllocations();
const { enriched, filtered, availableNetworks, isLoading, refetch } = useSubgraphs(indexerChains, allocatedDeployments);

// Debounced signal filter inputs
function debounce(fn: (...args: unknown[]) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const localMinSignal = ref(settingsStore.state.minSignal);
const localMaxSignal = ref(settingsStore.state.maxSignal);

const syncMinSignal = debounce((v: unknown) => { settingsStore.state.minSignal = String(v); }, 300);
const syncMaxSignal = debounce((v: unknown) => { settingsStore.state.maxSignal = String(v); }, 300);

watch(localMinSignal, syncMinSignal);
watch(localMaxSignal, syncMaxSignal);

const showNewAprColumn = computed(() =>
  settingsStore.state.subgraphColumns.some((c) => c.id === 'newApr' && c.visible),
);

const deniedOptions = [
  { label: 'Exclude Denied', value: 0 },
  { label: 'Include Denied', value: 1 },
  { label: 'Only Denied', value: 2 },
];

const tableHeight = computed(() => Math.max(window.innerHeight - 280, 400));

// Auto-refresh
useAutoRefresh(() => refetch());
</script>

<style scoped>
.subgraphs-dashboard {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dashboard-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.subgraph-count {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.filter-item label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.checkbox-item {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.checkbox-item label {
  font-size: 0.85rem;
}
</style>
