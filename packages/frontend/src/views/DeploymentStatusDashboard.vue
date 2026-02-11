<template>
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h2>Deployment Status</h2>
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

    <div v-if="!indexerUrl" class="empty-state">
      <p>No indexer URL configured. Set an active account with an indexer URL in Settings.</p>
    </div>

    <div v-else-if="isLoading" class="loading-state">
      <ProgressBar mode="indeterminate" style="height: 4px" />
    </div>

    <div v-else-if="error" class="error-state">
      <p>Failed to fetch deployment status: {{ (error as Error).message }}</p>
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
              <td :colspan="columns.length" class="td-cell empty-row">No deployments found.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';
import {
  useVueTable,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  FlexRender,
} from '@tanstack/vue-table';
import type { SortingState } from '@tanstack/vue-table';
import { ref } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import Tag from 'primevue/tag';
import { useDeploymentStatus } from '../composables/queries/useDeploymentStatus';
import type { EnrichedDeploymentStatus } from '../composables/queries/useDeploymentStatus';
import { useAccount } from '../composables/queries/useAccount';

const { data: account } = useAccount();
const indexerUrl = computed(() => account.value?.url ?? '');
const { data, isLoading, isFetching, error, refetch } = useDeploymentStatus();

const sorting = ref<SortingState>([{ id: 'blocksBehindChainhead', desc: false }]);

const colHelper = createColumnHelper<EnrichedDeploymentStatus>();

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 16) return hash;
  return hash.slice(0, 8) + '...' + hash.slice(-6);
}

const columns = [
  colHelper.accessor('subgraph', {
    header: 'Deployment',
    size: 200,
    cell: (info) => h('code', { title: info.getValue(), style: 'font-size: 0.8rem' }, truncateHash(info.getValue())),
  }),
  colHelper.accessor('statusLabel', {
    header: 'Status',
    size: 180,
    cell: (info) => {
      const row = info.row.original;
      const severityMap: Record<string, string> = {
        green: 'success',
        red: 'danger',
        yellow: 'warn',
        blue: 'info',
      };
      return h(Tag, {
        value: info.getValue(),
        severity: severityMap[row.statusColor] ?? 'secondary',
      });
    },
  }),
  colHelper.accessor('entityCount', {
    header: 'Entities',
    size: 120,
    cell: (info) => (info.getValue() ?? 0).toLocaleString(),
  }),
  colHelper.accessor((row) => {
    const chain = row.chains?.[0];
    return chain?.latestBlock?.number ? parseInt(chain.latestBlock.number, 10) : 0;
  }, {
    id: 'latestBlock',
    header: 'Latest Block',
    size: 130,
    cell: (info) => {
      const val = info.getValue();
      return val > 0 ? val.toLocaleString() : '—';
    },
  }),
  colHelper.accessor((row) => {
    const chain = row.chains?.[0];
    return chain?.chainHeadBlock?.number ? parseInt(chain.chainHeadBlock.number, 10) : 0;
  }, {
    id: 'chainHead',
    header: 'Chain Head',
    size: 130,
    cell: (info) => {
      const val = info.getValue();
      return val > 0 ? val.toLocaleString() : '—';
    },
  }),
  colHelper.accessor('blocksBehindChainhead', {
    header: 'Blocks Behind',
    size: 130,
    cell: (info) => {
      const val = info.getValue();
      if (val === Number.MAX_SAFE_INTEGER) return '—';
      return val.toLocaleString();
    },
  }),
  colHelper.accessor((row) => row.fatalError?.message ?? '', {
    id: 'fatalError',
    header: 'Fatal Error',
    size: 300,
    enableSorting: false,
    cell: (info) => {
      const msg = info.getValue();
      if (!msg) return '';
      const truncated = msg.length > 80 ? msg.slice(0, 80) + '...' : msg;
      return h('span', { title: msg, style: 'color: var(--p-red-400); font-size: 0.8rem' }, truncated);
    },
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
.error-state,
.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.table-container {
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.table-scroll {
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
