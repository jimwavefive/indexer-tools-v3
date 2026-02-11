<template>
  <div class="history-table-container">
    <div class="table-scroll">
      <table class="history-table">
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
            <td :colspan="columnCount">
              <ProgressBar mode="indeterminate" style="height: 4px" />
            </td>
          </tr>
          <tr v-for="row in rows" :key="row.id" class="data-row">
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              class="td-cell"
            >
              <FlexRender
                :render="cell.column.columnDef.cell"
                :props="cell.getContext()"
              />
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td :colspan="columnCount" class="no-data">
              No notification history
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>{{ rows.length }} entr{{ rows.length !== 1 ? 'ies' : 'y' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  useVueTable,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  FlexRender,
  type SortingState,
} from '@tanstack/vue-table';
import ProgressBar from 'primevue/progressbar';
import { format } from 'date-fns';
import type { HistoryRecord } from '@indexer-tools/shared';

const props = withDefaults(defineProps<{
  data: HistoryRecord[];
  loading?: boolean;
}>(), {
  loading: false,
});

const sorting = ref<SortingState>([{ id: 'timestamp', desc: true }]);

const columnHelper = createColumnHelper<HistoryRecord>();

const columns = [
  columnHelper.accessor('timestamp', {
    id: 'timestamp',
    header: 'Time',
    size: 150,
    cell: (info) => {
      const ts = info.getValue();
      return ts ? format(new Date(ts), 'MMM d, HH:mm:ss') : '\u2014';
    },
  }),
  columnHelper.accessor((row) => row.notification.title, {
    id: 'title',
    header: 'Title',
    size: 250,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => row.notification.message, {
    id: 'message',
    header: 'Message',
    size: 300,
    cell: (info) => {
      const msg = info.getValue();
      return msg.length > 80 ? msg.slice(0, 80) + '\u2026' : msg;
    },
  }),
  columnHelper.accessor((row) => row.notification.severity, {
    id: 'severity',
    header: 'Severity',
    size: 80,
    cell: (info) => info.getValue().toUpperCase(),
  }),
  columnHelper.accessor('channelIds', {
    id: 'channels',
    header: 'Channels',
    size: 80,
    cell: (info) => {
      const ids = info.getValue();
      return ids.length > 0 ? `${ids.length} ch` : '\u2014';
    },
  }),
  columnHelper.accessor((row) => row.isTest ?? false, {
    id: 'isTest',
    header: 'Test',
    size: 60,
    cell: (info) => (info.getValue() ? 'Yes' : ''),
  }),
];

const table = useVueTable({
  get data() { return props.data; },
  columns,
  state: {
    get sorting() { return sorting.value; },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getRowId: (row) => row.id,
});

const rows = computed(() => table.getRowModel().rows);
const columnCount = computed(() => table.getHeaderGroups()[0]?.headers.length ?? 0);
</script>

<style scoped>
.history-table-container {
  display: flex;
  flex-direction: column;
}

.table-scroll {
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.history-table thead {
  position: sticky;
  top: 0;
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
}

.sort-indicator {
  font-size: 0.7rem;
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
  border-top: 1px solid var(--app-surface-border);
}
</style>
