<template>
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h2>QoS Performance</h2>
      <div class="header-actions">
        <span v-if="data" class="row-count">{{ data.length }} allocations</span>
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          text
          :loading="isFetching"
          @click="refetch()"
        />
      </div>
    </div>

    <div v-if="!isArbitrum" class="empty-state">
      <p>QoS data is only available on Arbitrum One. Please switch chains in Settings.</p>
    </div>

    <div v-else-if="!activeAddress" class="empty-state">
      <p>No active account configured. Set an active account in Settings.</p>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <ProgressBar mode="indeterminate" style="height: 4px" />
    </div>

    <div v-else-if="error" class="error-state">
      <p>Failed to fetch QoS data: {{ (error as Error).message }}</p>
      <Button label="Retry" severity="secondary" size="small" @click="refetch()" />
    </div>

    <div v-else-if="data" class="table-container">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
              <th
                v-for="header in headerGroup.headers"
                :key="header.id"
                :style="{ width: `${header.getSize()}px`, cursor: header.column.getCanSort() ? 'pointer' : 'default' }"
                @click="header.column.getToggleSortingHandler()?.($event)"
                class="th-cell"
              >
                <div class="th-content">
                  <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
                  <span v-if="header.column.getIsSorted()" class="sort-indicator">
                    {{ header.column.getIsSorted() === 'asc' ? '▲' : '▼' }}
                  </span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="data-row">
              <td v-for="cell in row.getVisibleCells()" :key="cell.id" class="td-cell">
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td :colspan="columns.length" class="td-cell empty-row">No QoS data found.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, h } from 'vue';
import {
  useVueTable,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  FlexRender,
} from '@tanstack/vue-table';
import type { SortingState } from '@tanstack/vue-table';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useQos } from '../composables/queries/useQos';
import type { QosRow } from '../composables/queries/useQos';
import { useChainStore } from '../composables/state/useChain';
import { useSettingsStore } from '../composables/state/useSettings';
import { CHAIN_NAME_MAP } from '@indexer-tools/shared';

const chainStore = useChainStore();
const settingsStore = useSettingsStore();
const isArbitrum = computed(() => chainStore.activeChainId === 'arbitrum-one');
const activeAddress = computed(() => settingsStore.getActiveAccount()?.address ?? '');

const { data, isLoading, isFetching, error, refetch } = useQos();

const sorting = ref<SortingState>([{ id: 'query_count', desc: true }]);

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 16) return hash;
  return hash.slice(0, 8) + '...' + hash.slice(-6);
}

const colHelper = createColumnHelper<QosRow>();

const columns = [
  colHelper.accessor('subgraph_deployment_ipfs_hash', {
    header: 'Deployment',
    size: 200,
    cell: (info) => h('code', { title: info.getValue(), style: 'font-size: 0.8rem' }, truncateHash(info.getValue())),
  }),
  colHelper.accessor('chain_id', {
    header: 'Chain',
    size: 110,
    cell: (info) => CHAIN_NAME_MAP[info.getValue()] ?? info.getValue(),
  }),
  colHelper.accessor('query_count', {
    header: 'Queries',
    size: 100,
    cell: (info) => info.getValue().toLocaleString(),
  }),
  colHelper.accessor('avg_indexer_latency_ms', {
    header: 'Avg Latency (ms)',
    size: 140,
    cell: (info) => info.getValue().toFixed(1),
  }),
  colHelper.accessor('max_indexer_latency_ms', {
    header: 'Max Latency (ms)',
    size: 140,
    cell: (info) => info.getValue().toFixed(1),
  }),
  colHelper.accessor('avg_indexer_blocks_behind', {
    header: 'Avg Blocks Behind',
    size: 150,
    cell: (info) => info.getValue().toFixed(1),
  }),
  colHelper.accessor('max_indexer_blocks_behind', {
    header: 'Max Blocks Behind',
    size: 150,
    cell: (info) => info.getValue().toFixed(0),
  }),
  colHelper.accessor('num_indexer_200_responses', {
    header: '200 Responses',
    size: 130,
    cell: (info) => info.getValue().toLocaleString(),
  }),
  colHelper.accessor('proportion_indexer_200_responses', {
    header: '200 Rate',
    size: 100,
    cell: (info) => (info.getValue() * 100).toFixed(1) + '%',
  }),
  colHelper.accessor('total_query_fees', {
    header: 'Total Fees',
    size: 120,
    cell: (info) => info.getValue().toLocaleString('en-US', { maximumFractionDigits: 4 }),
  }),
];

const table = useVueTable({
  get data() { return data.value ?? []; },
  columns,
  state: { get sorting() { return sorting.value; } },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});

const rows = computed(() => table.getRowModel().rows);
</script>

<style scoped>
.dashboard-page {
  padding: 1rem;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.dashboard-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.row-count {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.empty-state,
.loading-state,
.error-state {
  padding: 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.table-container {
  overflow: hidden;
}

.table-scroll {
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.th-cell {
  padding: 0.6rem 0.75rem;
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 2px solid var(--p-content-border-color);
  background: var(--p-surface-50);
  user-select: none;
}

.th-content {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.sort-indicator {
  font-size: 0.65rem;
}

.td-cell {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  white-space: nowrap;
}

.data-row:hover {
  background: var(--p-surface-hover);
}

.empty-row {
  text-align: center;
  color: var(--p-text-muted-color);
  padding: 2rem;
}
</style>
