<template>
  <div class="subgraph-table-container">
    <div ref="tableContainer" class="table-scroll" :style="{ height: `${tableHeight}px` }">
      <table class="subgraph-table">
        <thead>
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th
              v-if="selectable"
              class="th-select"
            >
              <Checkbox
                :model-value="table.getIsAllRowsSelected()"
                :indeterminate="table.getIsSomeRowsSelected()"
                @update:model-value="table.toggleAllRowsSelected()"
                :binary="true"
              />
            </th>
            <th
              v-for="header in headerGroup.headers"
              :key="header.id"
              :style="{ width: `${header.getSize()}px`, cursor: header.column.getCanSort() ? 'pointer' : 'default' }"
              @click="header.column.getToggleSortingHandler()?.($event)"
              class="th-cell"
            >
              <div class="th-content">
                <FlexRender
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
                <span v-if="header.column.getIsSorted()" class="sort-indicator">
                  {{ header.column.getIsSorted() === 'asc' ? '\u25B2' : '\u25BC' }}
                </span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading" class="loading-row">
            <td :colspan="visibleColumnCount + (selectable ? 1 : 0)">
              <ProgressBar mode="indeterminate" style="height: 4px" />
            </td>
          </tr>
          <template v-if="virtualRows.length > 0">
            <tr v-if="paddingTop > 0">
              <td :colspan="visibleColumnCount + (selectable ? 1 : 0)" :style="{ height: `${paddingTop}px`, padding: 0 }" />
            </tr>
            <tr
              v-for="virtualRow in virtualRows"
              :key="virtualRow.key"
              :ref="(el) => virtualizer.measureElement(el as Element)"
              :data-index="virtualRow.index"
              class="data-row"
            >
              <td v-if="selectable" class="td-select">
                <Checkbox
                  :model-value="rows[virtualRow.index].getIsSelected()"
                  @update:model-value="rows[virtualRow.index].toggleSelected()"
                  :binary="true"
                />
              </td>
              <td
                v-for="cell in rows[virtualRow.index].getVisibleCells()"
                :key="cell.id"
                class="td-cell"
              >
                <FlexRender
                  :render="cell.column.columnDef.cell"
                  :props="cell.getContext()"
                />
              </td>
            </tr>
            <tr v-if="paddingBottom > 0">
              <td :colspan="visibleColumnCount + (selectable ? 1 : 0)" :style="{ height: `${paddingBottom}px`, padding: 0 }" />
            </tr>
          </template>
          <tr v-else-if="!loading">
            <td :colspan="visibleColumnCount + (selectable ? 1 : 0)" class="no-data">
              No subgraphs match the current filters
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>{{ rows.length }} subgraphs</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  useVueTable,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  FlexRender,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/vue-table';
import { useVirtualizer } from '@tanstack/vue-virtual';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import { formatGrt, formatApr } from '@indexer-tools/shared';
import { format } from 'date-fns';
import type { EnrichedSubgraphRow } from '../../composables/queries/useSubgraphs';
import { useSettingsStore } from '../../composables/state/useSettings';

const props = withDefaults(defineProps<{
  data: EnrichedSubgraphRow[];
  loading?: boolean;
  selectable?: boolean;
  tableHeight?: number;
}>(), {
  loading: false,
  selectable: false,
  tableHeight: 700,
});

const emit = defineEmits<{
  'update:selected': [ipfsHashes: string[]];
}>();

const settingsStore = useSettingsStore();

// Sorting state synced to settings store
const sorting = ref<SortingState>(
  settingsStore.state.subgraphSort.map((s) => ({ id: s.id, desc: s.desc })),
);

watch(sorting, (val) => {
  settingsStore.state.subgraphSort = val.map((s) => ({ id: s.id, desc: s.desc }));
}, { deep: true });

// Row selection
const rowSelection = ref<RowSelectionState>({});

watch(rowSelection, (val) => {
  const selectedHashes = Object.keys(val)
    .filter((k) => val[k])
    .map((idx) => props.data[parseInt(idx)]?.ipfsHash)
    .filter(Boolean);
  emit('update:selected', selectedHashes);
}, { deep: true });

// Column helper
const columnHelper = createColumnHelper<EnrichedSubgraphRow>();

// Column visibility from settings
const columnVisibility = computed(() => {
  const vis: Record<string, boolean> = {};
  for (const col of settingsStore.state.subgraphColumns) {
    vis[col.id] = col.visible;
  }
  return vis;
});

// Define all columns
const columns = [
  columnHelper.accessor('displayName', {
    id: 'name',
    header: 'Name',
    size: 200,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('network', {
    id: 'network',
    header: 'Network',
    size: 100,
    cell: (info) => info.getValue() || '\u2014',
  }),
  columnHelper.accessor('createdAt', {
    id: 'createdAt',
    header: 'Created',
    size: 130,
    cell: (info) => {
      const ts = info.getValue();
      return ts ? format(new Date(ts * 1000), 'MMM d, yyyy') : '\u2014';
    },
  }),
  columnHelper.accessor('apr', {
    id: 'apr',
    header: 'Current APR',
    size: 100,
    cell: (info) => formatApr(info.getValue()),
  }),
  columnHelper.accessor('newApr', {
    id: 'newApr',
    header: 'New APR',
    size: 100,
    cell: (info) => formatApr(info.getValue()),
  }),
  columnHelper.accessor('maxAllo', {
    id: 'maxAllo',
    header: 'Max Allocation',
    size: 120,
    cell: (info) => {
      const val = info.getValue();
      return val > 0 ? `${formatGrt(val)} GRT` : '\u2014';
    },
  }),
  columnHelper.accessor('dailyRewards', {
    id: 'dailyRewards',
    header: 'Est Daily Rewards',
    size: 130,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
  }),
  columnHelper.accessor('dailyRewardsCut', {
    id: 'dailyRewardsCut',
    header: 'Daily Rewards (Cut)',
    size: 140,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
  }),
  columnHelper.accessor((row) => Number(row.signalledTokens / (10n ** 18n)), {
    id: 'signalledTokens',
    header: 'Current Signal',
    size: 120,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
  }),
  columnHelper.accessor('proportion', {
    id: 'proportion',
    header: 'Proportion',
    size: 100,
    cell: (info) => info.getValue().toFixed(4),
  }),
  columnHelper.accessor((row) => Number(row.stakedTokens / (10n ** 18n)), {
    id: 'stakedTokens',
    header: 'Allocations',
    size: 120,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
  }),
  columnHelper.accessor('ipfsHash', {
    id: 'deploymentId',
    header: 'Deployment ID',
    size: 160,
    enableSorting: false,
    cell: (info) => info.getValue(),
  }),
];

const table = useVueTable({
  get data() { return props.data; },
  columns,
  state: {
    get sorting() { return sorting.value; },
    get rowSelection() { return rowSelection.value; },
    get columnVisibility() { return columnVisibility.value; },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  onRowSelectionChange: (updater) => {
    rowSelection.value = typeof updater === 'function' ? updater(rowSelection.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getRowId: (row) => row.ipfsHash,
  enableRowSelection: props.selectable,
});

const rows = computed(() => table.getRowModel().rows);

const visibleColumnCount = computed(() =>
  table.getHeaderGroups()[0]?.headers.length ?? 0,
);

// Virtual scrolling
const tableContainer = ref<HTMLElement | null>(null);

const virtualizer = useVirtualizer({
  get count() { return rows.value.length; },
  getScrollElement: () => tableContainer.value,
  estimateSize: () => 40,
  overscan: 20,
});

const virtualRows = computed(() => virtualizer.value.getVirtualItems());

const paddingTop = computed(() =>
  virtualRows.value.length > 0 ? virtualRows.value[0].start : 0,
);
const paddingBottom = computed(() =>
  virtualRows.value.length > 0
    ? virtualizer.value.getTotalSize() - virtualRows.value[virtualRows.value.length - 1].end
    : 0,
);
</script>

<style scoped>
.subgraph-table-container {
  display: flex;
  flex-direction: column;
}

.table-scroll {
  overflow-y: auto;
  overflow-x: auto;
}

.subgraph-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.subgraph-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--p-surface-0);
}

:deep(.dark-mode) .subgraph-table thead {
  background: var(--p-surface-900);
}

.th-cell {
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 2px solid var(--p-surface-200);
  user-select: none;
}

:deep(.dark-mode) .th-cell {
  border-bottom-color: var(--p-surface-700);
}

.th-content {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.sort-indicator {
  font-size: 0.7rem;
}

.th-select, .td-select {
  width: 40px;
  padding: 0.25rem 0.5rem;
}

.td-cell {
  padding: 0.375rem 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid var(--p-surface-100);
}

:deep(.dark-mode) .td-cell {
  border-bottom-color: var(--p-surface-800);
}

.data-row:hover {
  background: var(--p-surface-50);
}

:deep(.dark-mode) .data-row:hover {
  background: var(--p-surface-800);
}

.no-data {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.loading-row td {
  padding: 0;
}

.table-footer {
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  border-top: 1px solid var(--p-surface-200);
}

:deep(.dark-mode) .table-footer {
  border-top-color: var(--p-surface-700);
}
</style>
