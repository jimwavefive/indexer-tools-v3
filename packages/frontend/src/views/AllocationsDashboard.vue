<template>
  <div class="allocations-dashboard">
    <!-- Toolbar -->
    <div class="dashboard-toolbar">
      <Button
        label="Refresh"
        icon="pi pi-refresh"
        severity="secondary"
        :loading="isLoading"
        @click="refetch()"
      />
      <Button
        label="Fetch Pending Rewards"
        icon="pi pi-download"
        severity="secondary"
        :loading="pendingRewardsLoading"
        :disabled="enriched.length === 0"
        @click="fetchPendingRewards()"
      />
      <span class="allocation-count" v-if="!isLoading">
        {{ filtered.length }} / {{ enriched.length }} allocations
      </span>
    </div>

    <!-- Filter bar -->
    <div class="filter-row">
      <div class="filter-item">
        <label>Networks</label>
        <MultiSelect
          v-model="networkFilter"
          :options="availableNetworks"
          placeholder="All networks"
          display="chip"
          style="width: 14rem"
        />
      </div>
      <div class="filter-item checkbox-item">
        <Checkbox v-model="activateBlacklist" :binary="true" input-id="allo-bl" />
        <label for="allo-bl">Blacklist</label>
      </div>
      <div class="filter-item checkbox-item">
        <Checkbox v-model="activateSynclist" :binary="true" input-id="allo-sl" />
        <label for="allo-sl">Synclist</label>
      </div>
      <div class="filter-item">
        <label>Min Epochs</label>
        <InputText
          v-model.number="minEpochDuration"
          type="number"
          min="0"
          style="width: 6rem"
        />
      </div>
    </div>

    <!-- Data table -->
    <AllocationTable
      :data="filtered"
      :pending-rewards="pendingRewardsData"
      :reward-cut="accountData?.rewardCut ?? 0"
      :loading="isLoading"
      :table-height="tableHeight"
      :totals="totals"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Checkbox from 'primevue/checkbox';
import AllocationTable from '../components/tables/AllocationTable.vue';
import {
  useAllocations,
  applyAllocationFilters,
  type AllocationFilters,
} from '../composables/queries/useAllocations';
import { usePendingRewards } from '../composables/queries/usePendingRewards';
import { useAccount } from '../composables/queries/useAccount';
import { useSettingsStore } from '../composables/state/useSettings';
import { useAutoRefresh } from '../composables/util/useAutoRefresh';

const settingsStore = useSettingsStore();

const {
  enriched,
  availableNetworks,
  totals,
  isLoading,
  refetch,
} = useAllocations();

const { data: accountData } = useAccount();

// Pending rewards via multicall
const allocsForRewards = computed(() =>
  enriched.value.map((a) => ({ id: a.id, isLegacy: a.isLegacy })),
);

const {
  data: pendingRewardsRaw,
  isLoading: pendingRewardsLoading,
  refetch: refetchPendingRewards,
} = usePendingRewards(allocsForRewards);

const pendingRewardsData = computed(() => pendingRewardsRaw.value ?? {});

function fetchPendingRewards() {
  refetchPendingRewards();
}

// Local filter state (not persisted — matches v3 behavior)
const networkFilter = ref<string[]>([]);
const activateBlacklist = ref(false);
const activateSynclist = ref(false);
const minEpochDuration = ref(0);

// Build filter params
const filterParams = computed<AllocationFilters>(() => ({
  networkFilter: networkFilter.value,
  activateBlacklist: activateBlacklist.value,
  blacklistSet: new Set(settingsStore.getCombinedBlacklist()),
  activateSynclist: activateSynclist.value,
  synclistSet: new Set(
    settingsStore.state.subgraphSynclist
      ? settingsStore.state.subgraphSynclist
          .split('\n')
          .map((l: string) => l.trim())
          .filter(Boolean)
      : [],
  ),
  minEpochDuration: minEpochDuration.value,
}));

// Filtered allocations
const filtered = computed(() =>
  applyAllocationFilters(enriched.value, filterParams.value),
);

const tableHeight = computed(() => Math.max(window.innerHeight - 260, 400));

// Auto-refresh
useAutoRefresh(() => refetch());
</script>

<style scoped>
.allocations-dashboard {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dashboard-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.allocation-count {
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
