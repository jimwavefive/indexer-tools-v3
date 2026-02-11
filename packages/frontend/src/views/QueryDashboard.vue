<template>
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h2>Query Fees</h2>
      <div class="header-actions">
        <span v-if="data" class="row-count">{{ data.length }} deployments</span>
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          text
          :loading="isFetching"
          @click="refetch()"
        />
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <ProgressBar mode="indeterminate" style="height: 4px" />
    </div>

    <div v-else-if="error" class="error-state">
      <p>Failed to fetch query fees: {{ (error as Error).message }}</p>
      <Button label="Retry" severity="secondary" size="small" @click="refetch()" />
    </div>

    <div v-else-if="data" class="table-container">
      <div class="summary-cards">
        <div class="summary-card">
          <span class="summary-label">Total Fees</span>
          <span class="summary-value">{{ totalFees.toLocaleString('en-US', { maximumFractionDigits: 2 }) }} GRT</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">Total Queries</span>
          <span class="summary-value">{{ totalQueries.toLocaleString() }}</span>
        </div>
      </div>

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
              <td :colspan="columns.length" class="td-cell empty-row">No query fee data found.</td>
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
import { useQueryFees } from '../composables/queries/useQueryFees';
import type { QueryFeeRow } from '../composables/queries/useQueryFees';
import { CHAIN_NAME_MAP } from '@indexer-tools/shared';

const { data, isLoading, isFetching, error, refetch } = useQueryFees();

const sorting = ref<SortingState>([{ id: 'total_query_fees', desc: true }]);

const totalFees = computed(() =>
  (data.value ?? []).reduce((sum, r) => sum + r.total_query_fees, 0),
);
const totalQueries = computed(() =>
  (data.value ?? []).reduce((sum, r) => sum + r.query_count, 0),
);

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 16) return hash;
  return hash.slice(0, 8) + '...' + hash.slice(-6);
}

const colHelper = createColumnHelper<QueryFeeRow>();

const columns = [
  colHelper.accessor('deploymentId', {
    header: 'Deployment',
    size: 200,
    cell: (info) => h('code', { title: info.getValue(), style: 'font-size: 0.8rem' }, truncateHash(info.getValue())),
  }),
  colHelper.accessor('chain_id', {
    header: 'Chain',
    size: 120,
    cell: (info) => CHAIN_NAME_MAP[info.getValue()] ?? info.getValue(),
  }),
  colHelper.accessor('query_count', {
    header: 'Queries',
    size: 110,
    cell: (info) => info.getValue().toLocaleString(),
  }),
  colHelper.accessor('total_query_fees', {
    header: 'Total Fees',
    size: 130,
    cell: (info) => info.getValue().toLocaleString('en-US', { maximumFractionDigits: 4 }),
  }),
  colHelper.accessor('avg_query_fee', {
    header: 'Avg Fee',
    size: 120,
    cell: (info) => info.getValue().toLocaleString('en-US', { maximumFractionDigits: 6 }),
  }),
  colHelper.accessor('avg_gateway_latency_ms', {
    header: 'Avg Latency (ms)',
    size: 140,
    cell: (info) => info.getValue().toFixed(1),
  }),
  colHelper.accessor('gateway_query_success_rate', {
    header: 'Success Rate',
    size: 120,
    cell: (info) => (info.getValue() * 100).toFixed(1) + '%',
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

.loading-state,
.error-state {
  padding: 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.summary-cards {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.summary-card {
  padding: 0.75rem 1rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
}

.summary-value {
  font-size: 1.1rem;
  font-weight: 600;
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
