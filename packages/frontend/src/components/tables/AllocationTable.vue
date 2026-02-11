<template>
  <div class="allocation-table-container">
    <div ref="tableContainer" class="table-scroll" :style="{ height: `${tableHeight}px` }">
      <table class="allocation-table">
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
              :style="{ width: `${header.getSize()}px` }"
              class="th-cell"
            >
              <div class="th-content" @click.stop="header.column.getToggleSortingHandler()?.($event)">
                <FlexRender
                  :render="header.column.columnDef.header"
                  :props="header.getContext()"
                />
                <span v-if="header.column.getIsSorted()" class="sort-indicator">
                  {{ header.column.getIsSorted() === 'asc' ? '\u25B2' : '\u25BC' }}
                </span>
              </div>
              <ColumnFilter
                :column="header.column"
                :filter-type="getFilterType(header.column.id)"
                :options="getFilterOptions(header.column.id)"
              />
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
              No allocations match the current filters
            </td>
          </tr>
        </tbody>
        <!-- Footer totals row -->
        <tfoot v-if="rows.length > 0">
          <tr class="footer-row">
            <td v-if="selectable" class="td-select"></td>
            <td
              v-for="header in table.getHeaderGroups()[0]?.headers ?? []"
              :key="'foot-' + header.id"
              class="td-cell footer-cell"
            >
              <template v-if="header.id === 'name'">
                <strong>{{ totals.count }} allocations</strong>
              </template>
              <template v-else-if="header.id === 'apr'">
                <strong>{{ formatApr(totals.avgApr) }}</strong>
              </template>
              <template v-else-if="header.id === 'dailyRewards'">
                <strong>{{ totals.dailyRewardsSum.toLocaleString() }} GRT</strong>
              </template>
              <template v-else-if="header.id === 'dailyRewardsCut'">
                <strong>{{ totals.dailyRewardsCutSum.toLocaleString() }} GRT</strong>
              </template>
              <template v-else-if="header.id === 'pendingRewards'">
                <strong>{{ formatGrt(weiToNumber(pendingRewardsTotal)) }} GRT</strong>
              </template>
              <template v-else-if="header.id === 'pendingRewardsCut'">
                <strong>{{ formatGrt(weiToNumber(pendingRewardsCutTotal)) }} GRT</strong>
              </template>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, h } from 'vue';
import {
  useVueTable,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  FlexRender,
  type SortingState,
  type RowSelectionState,
  type ColumnFiltersState,
} from '@tanstack/vue-table';
import { useVirtualizer } from '@tanstack/vue-virtual';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import { formatGrt, formatApr, weiToNumber } from '@indexer-tools/shared';
import type { EnrichedAllocationRow, AllocationTotals } from '../../composables/queries/useAllocations';
import { useSettingsStore } from '../../composables/state/useSettings';
import ColumnFilter from './ColumnFilter.vue';

const props = withDefaults(defineProps<{
  data: EnrichedAllocationRow[];
  pendingRewards?: Record<string, bigint>;
  rewardCut?: number;
  loading?: boolean;
  selectable?: boolean;
  tableHeight?: number;
  totals: AllocationTotals;
}>(), {
  pendingRewards: () => ({}),
  rewardCut: 0,
  loading: false,
  selectable: false,
  tableHeight: 700,
});

const emit = defineEmits<{
  'update:selected': [allocationIds: string[]];
}>();

const settingsStore = useSettingsStore();

// Sorting state synced to settings store
const sorting = ref<SortingState>(
  settingsStore.state.allocationSort.map((s) => ({ id: s.id, desc: s.desc })),
);

watch(sorting, (val) => {
  settingsStore.state.allocationSort = val.map((s) => ({ id: s.id, desc: s.desc }));
}, { deep: true });

// Column filters
const columnFilters = ref<ColumnFiltersState>([]);

const NUMBER_COLUMNS = new Set([
  'allocatedTokens', 'activeDuration', 'apr', 'dailyRewards', 'dailyRewardsCut',
  'pendingRewards', 'pendingRewardsCut', 'signalledTokens', 'proportion', 'stakedTokens',
]);

const SELECT_COLUMNS = new Set(['status', 'network', 'statusChecks']);

const STATUS_CHECK_OPTIONS = [
  'Closeable', 'Synced', 'Syncing', 'Failed', 'Deterministic', 'Non-deterministic',
];

function getFilterType(columnId: string): 'text' | 'number' | 'select' {
  if (SELECT_COLUMNS.has(columnId)) return 'select';
  return NUMBER_COLUMNS.has(columnId) ? 'number' : 'text';
}

function getFilterOptions(columnId: string): string[] | undefined {
  if (!SELECT_COLUMNS.has(columnId)) return undefined;
  if (columnId === 'statusChecks') return STATUS_CHECK_OPTIONS;
  const values = new Set<string>();
  for (const row of props.data) {
    if (columnId === 'status') {
      values.add(row.deniedAt ? 'Denied' : 'Active');
    } else if (columnId === 'network' && row.network) {
      values.add(row.network);
    }
  }
  return [...values].sort();
}

function statusCheckFilter(row: any, _columnId: string, filterValue: string) {
  const original = row.original;
  const hs = original.healthStatus as string;
  switch (filterValue) {
    case 'Closeable':
      return hs === 'Synced' || hs === 'Failed (Deterministic)';
    case 'Synced':
      return hs === 'Synced';
    case 'Syncing':
      return hs === 'Syncing';
    case 'Failed':
      return hs.startsWith('Failed');
    case 'Deterministic':
      return hs === 'Failed (Deterministic)';
    case 'Non-deterministic':
      return hs === 'Failed (Non-deterministic)';
    default:
      return true;
  }
}

function numberRangeFilter(row: any, columnId: string, filterValue: [number?, number?]) {
  const val = row.getValue(columnId) as number;
  const [min, max] = filterValue;
  if (min !== undefined && val < min) return false;
  if (max !== undefined && val > max) return false;
  return true;
}

// Row selection
const rowSelection = ref<RowSelectionState>({});

watch(rowSelection, (val) => {
  // Keys ARE allocation IDs (from getRowId), not numeric indices
  const selectedIds = Object.keys(val).filter((k) => val[k]);
  emit('update:selected', selectedIds);
}, { deep: true });

// Column helper
const columnHelper = createColumnHelper<EnrichedAllocationRow>();

// Column visibility from settings
const columnVisibility = computed(() => {
  const vis: Record<string, boolean> = {};
  for (const col of settingsStore.state.allocationColumns) {
    vis[col.id] = col.visible;
  }
  return vis;
});

// Pending rewards helper
function getPendingReward(alloId: string): bigint {
  return props.pendingRewards[alloId] ?? 0n;
}

function getPendingRewardCut(alloId: string): bigint {
  const reward = getPendingReward(alloId);
  if (reward <= 0n || props.rewardCut <= 0) return 0n;
  return reward * BigInt(props.rewardCut) / 1000000n;
}

// Pending rewards totals
const pendingRewardsTotal = computed(() => {
  let sum = 0n;
  for (const allo of props.data) {
    if (!allo.deniedAt) {
      sum += getPendingReward(allo.id);
    }
  }
  return sum;
});

const pendingRewardsCutTotal = computed(() => {
  let sum = 0n;
  for (const allo of props.data) {
    if (!allo.deniedAt) {
      sum += getPendingRewardCut(allo.id);
    }
  }
  return sum;
});

// Define columns
const columns = [
  columnHelper.accessor((row) => row.deniedAt ? 'Denied' : 'Active', {
    id: 'status',
    header: 'Status',
    size: 80,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('healthStatus', {
    id: 'statusChecks',
    header: 'Health',
    size: 140,
    filterFn: statusCheckFilter,
    cell: (info) => {
      const row = info.row.original;
      const label = row.healthStatus || '\u2014';

      // Dot 1: Synced
      const syncedColor = row.healthSynced === true
        ? 'health-green'
        : row.healthSynced === false ? 'health-red' : 'health-default';

      // Dot 2: Deterministic failure
      const detColor = row.healthDeterministic === true
        ? 'health-red'
        : row.healthDeterministic === false ? 'health-yellow' : 'health-default';

      return h('span', { class: 'health-cell' }, [
        h('span', { class: `health-dot ${syncedColor}`, title: 'Synced' }),
        h('span', { class: `health-dot ${detColor}`, title: 'Deterministic' }),
        label,
      ]);
    },
  }),
  columnHelper.accessor('displayName', {
    id: 'name',
    header: 'Name',
    size: 180,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('network', {
    id: 'network',
    header: 'Network',
    size: 100,
    cell: (info) => info.getValue() || '\u2014',
  }),
  columnHelper.accessor((row) => Number(row.allocatedTokens / (10n ** 18n)), {
    id: 'allocatedTokens',
    header: 'Allocated',
    size: 110,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor('createdAtEpoch', {
    id: 'createdAt',
    header: 'Created',
    size: 90,
    cell: (info) => `Epoch ${info.getValue()}`,
  }),
  columnHelper.accessor('epochDuration', {
    id: 'activeDuration',
    header: 'Duration',
    size: 100,
    cell: (info) => `${info.getValue()} ep`,
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor('apr', {
    id: 'apr',
    header: 'APR',
    size: 80,
    cell: (info) => formatApr(info.getValue()),
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor('dailyRewards', {
    id: 'dailyRewards',
    header: 'Est Daily',
    size: 100,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor('dailyRewardsCut', {
    id: 'dailyRewardsCut',
    header: 'Daily (Cut)',
    size: 100,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor((row) => weiToNumber(getPendingReward(row.id)), {
    id: 'pendingRewards',
    header: 'Pending',
    size: 110,
    cell: (info) => {
      const val = info.getValue();
      return val > 0 ? `${formatGrt(val)} GRT` : '\u2014';
    },
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor((row) => weiToNumber(getPendingRewardCut(row.id)), {
    id: 'pendingRewardsCut',
    header: 'Pending (Cut)',
    size: 110,
    cell: (info) => {
      const val = info.getValue();
      return val > 0 ? `${formatGrt(val)} GRT` : '\u2014';
    },
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor((row) => Number(row.signalledTokens / (10n ** 18n)), {
    id: 'signalledTokens',
    header: 'Signal',
    size: 100,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor('proportion', {
    id: 'proportion',
    header: 'Proportion',
    size: 90,
    cell: (info) => info.getValue().toFixed(4),
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor((row) => Number(row.stakedTokens / (10n ** 18n)), {
    id: 'stakedTokens',
    header: 'Staked',
    size: 100,
    cell: (info) => `${info.getValue().toLocaleString()} GRT`,
    filterFn: numberRangeFilter,
  }),
  columnHelper.accessor('ipfsHash', {
    id: 'deploymentId',
    header: 'Deployment ID',
    size: 150,
    enableSorting: false,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('id', {
    id: 'allocationId',
    header: 'Allocation ID',
    size: 150,
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
    get columnFilters() { return columnFilters.value; },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  onRowSelectionChange: (updater) => {
    rowSelection.value = typeof updater === 'function' ? updater(rowSelection.value) : updater;
  },
  onColumnFiltersChange: (updater) => {
    columnFilters.value = typeof updater === 'function' ? updater(columnFilters.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getRowId: (row) => row.id,
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
.allocation-table-container {
  display: flex;
  flex-direction: column;
}

.table-scroll {
  overflow-y: auto;
  overflow-x: auto;
}

.allocation-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.allocation-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--app-table-bg);
}

.allocation-table tfoot {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background: var(--app-table-bg);
}

.th-cell {
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 2px solid var(--app-surface-border-strong);
  user-select: none;
}

.th-content {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
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
  border-bottom: 1px solid var(--app-surface-border);
}

.data-row:hover {
  background: var(--app-table-row-hover);
}

.footer-row {
  border-top: 2px solid var(--app-surface-border-strong);
}

.footer-cell {
  font-size: 0.8rem;
  border-bottom: none;
}

.no-data {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.loading-row td {
  padding: 0;
}

/* Health dot indicators */
:deep(.health-cell) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

:deep(.health-dot) {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

:deep(.health-green) { background: #4caf50; }
:deep(.health-blue) { background: #2196f3; }
:deep(.health-red) { background: #f44336; }
:deep(.health-yellow) { background: #ff9800; }
:deep(.health-default) { background: #9e9e9e; }
</style>
