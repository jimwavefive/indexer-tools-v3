<template>
  <div class="incident-table-container">
    <div class="table-scroll">
      <table class="incident-table">
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
            <th class="th-cell" style="width: 160px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading" class="loading-row">
            <td :colspan="columnCount + 1">
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
            <td class="td-cell actions-cell">
              <Button
                v-if="row.original.status === 'open'"
                label="ACK"
                severity="warn"
                size="small"
                text
                @click="$emit('acknowledge', row.original.id)"
              />
              <Button
                v-if="row.original.status !== 'resolved'"
                label="Resolve"
                severity="success"
                size="small"
                text
                @click="$emit('resolve', row.original.id)"
              />
              <Button
                v-if="isFixable(row.original)"
                label="Fix"
                severity="info"
                size="small"
                text
                @click="$emit('fix', row.original)"
              />
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td :colspan="columnCount + 1" class="no-data">
              No incidents found
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="table-footer">
      <span>{{ rows.length }} incident{{ rows.length !== 1 ? 's' : '' }}</span>
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
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { format } from 'date-fns';
import type { IncidentRecord } from '@indexer-tools/shared';

const props = withDefaults(defineProps<{
  data: IncidentRecord[];
  loading?: boolean;
  rules?: Array<{ id: string; name: string; type: string }>;
}>(), {
  loading: false,
  rules: () => [],
});

defineEmits<{
  acknowledge: [id: string];
  resolve: [id: string];
  fix: [incident: IncidentRecord];
}>();

const FIXABLE_RULE_TYPES = new Set(['behind_chainhead', 'behind_chainhead_allocated', 'failed_subgraph', 'failed_subgraph_allocated']);

function isFixable(incident: IncidentRecord): boolean {
  const rule = props.rules.find((r) => r.id === incident.rule_id);
  return rule ? FIXABLE_RULE_TYPES.has(rule.type) : false;
}

const sorting = ref<SortingState>([{ id: 'lastSeen', desc: true }]);

const columnHelper = createColumnHelper<IncidentRecord>();

const columns = [
  columnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    size: 100,
    cell: (info) => {
      const s = info.getValue();
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
  }),
  columnHelper.accessor('severity', {
    id: 'severity',
    header: 'Severity',
    size: 80,
    cell: (info) => info.getValue().toUpperCase(),
  }),
  columnHelper.accessor('rule_id', {
    id: 'rule',
    header: 'Rule',
    size: 160,
    cell: (info) => {
      const rule = props.rules.find((r) => r.id === info.getValue());
      return rule?.name ?? info.getValue().slice(0, 8);
    },
  }),
  columnHelper.accessor('target_label', {
    id: 'target',
    header: 'Target',
    size: 200,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('latest_title', {
    id: 'title',
    header: 'Title',
    size: 250,
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('first_seen', {
    id: 'firstSeen',
    header: 'First Seen',
    size: 140,
    cell: (info) => {
      const ts = info.getValue();
      return ts ? format(new Date(ts), 'MMM d, HH:mm') : '\u2014';
    },
  }),
  columnHelper.accessor('last_seen', {
    id: 'lastSeen',
    header: 'Last Seen',
    size: 140,
    cell: (info) => {
      const ts = info.getValue();
      return ts ? format(new Date(ts), 'MMM d, HH:mm') : '\u2014';
    },
  }),
  columnHelper.accessor('occurrence_count', {
    id: 'count',
    header: 'Count',
    size: 70,
    cell: (info) => info.getValue(),
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
.incident-table-container {
  display: flex;
  flex-direction: column;
}

.table-scroll {
  overflow-x: auto;
}

.incident-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.incident-table thead {
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

.actions-cell {
  display: flex;
  gap: 0.25rem;
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
