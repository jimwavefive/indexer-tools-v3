<template>
  <div class="incident-table-container">
    <div class="table-scroll">
      <table class="incident-table">
        <thead>
          <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <th class="th-cell" style="width: 36px"></th>
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
            <td :colspan="columnCount + 2">
              <ProgressBar mode="indeterminate" style="height: 4px" />
            </td>
          </tr>
          <template v-for="row in rows" :key="row.id">
            <tr class="data-row" :class="{ 'expanded-parent': row.getIsExpanded() }">
              <td class="td-cell expand-cell" @click="row.toggleExpanded()">
                <i :class="row.getIsExpanded() ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="expand-icon" />
              </td>
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
            <!-- Expanded detail row -->
            <tr v-if="row.getIsExpanded()" class="expanded-row">
              <td :colspan="columnCount + 2" class="expanded-cell">
                <div class="expanded-content">
                  <div v-if="row.original.latest_title" class="expanded-title">
                    {{ row.original.latest_title }}
                  </div>
                  <div v-if="row.original.latest_message" class="expanded-message">
                    {{ row.original.latest_message }}
                  </div>
                  <!-- Allocations to close -->
                  <div v-if="hasAllocationsToClose(row.original)" class="expanded-section">
                    <h4>Allocations to Close</h4>
                    <table class="detail-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Deployment</th>
                          <th>GRT</th>
                          <th>APR</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(allo, i) in getAllocationsToClose(row.original)" :key="i">
                          <td>{{ allo.name || '\u2014' }}</td>
                          <td class="mono">{{ truncateHash(allo.deployment || allo.ipfsHash || '') }}</td>
                          <td>{{ formatNumber(allo.allocatedGRT || allo.grt) }}</td>
                          <td>{{ formatAprValue(allo.apr) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <!-- Subgraphs -->
                  <div v-if="hasSubgraphs(row.original)" class="expanded-section">
                    <h4>Subgraphs</h4>
                    <table class="detail-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Deployment</th>
                          <th>GRT</th>
                          <th>Blocks Behind</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(sg, i) in getSubgraphs(row.original)" :key="i">
                          <td>{{ sg.name || '\u2014' }}</td>
                          <td class="mono">{{ truncateHash(sg.deployment || sg.ipfsHash || '') }}</td>
                          <td>{{ formatNumber(sg.allocatedGRT || sg.grt) }}</td>
                          <td>{{ sg.blocksBehind ?? '\u2014' }}</td>
                          <td class="error-text">{{ sg.error || '\u2014' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <!-- Generic metadata fallback -->
                  <div v-if="!hasAllocationsToClose(row.original) && !hasSubgraphs(row.original) && hasMetadata(row.original)" class="expanded-section">
                    <h4>Details</h4>
                    <div class="metadata-grid">
                      <template v-for="(value, key) in getVisibleMetadata(row.original)" :key="key">
                        <span class="meta-key">{{ key }}</span>
                        <span class="meta-value">{{ formatMetaValue(value) }}</span>
                      </template>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="!loading && rows.length === 0">
            <td :colspan="columnCount + 2" class="no-data">
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
  getExpandedRowModel,
  FlexRender,
  type SortingState,
  type ExpandedState,
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
const HIDDEN_META_KEYS = new Set(['ruleType', 'ruleName', 'ruleId']);

function isFixable(incident: IncidentRecord): boolean {
  const rule = props.rules.find((r) => r.id === incident.rule_id);
  return rule ? FIXABLE_RULE_TYPES.has(rule.type) : false;
}

// Metadata helpers
function hasAllocationsToClose(incident: IncidentRecord): boolean {
  const meta = incident.latest_metadata;
  return Array.isArray(meta?.allocationsToClose) && meta.allocationsToClose.length > 0;
}

function getAllocationsToClose(incident: IncidentRecord): Record<string, unknown>[] {
  return (incident.latest_metadata?.allocationsToClose as Record<string, unknown>[]) ?? [];
}

function hasSubgraphs(incident: IncidentRecord): boolean {
  const meta = incident.latest_metadata;
  return Array.isArray(meta?.subgraphs) && meta.subgraphs.length > 0;
}

function getSubgraphs(incident: IncidentRecord): Record<string, unknown>[] {
  return (incident.latest_metadata?.subgraphs as Record<string, unknown>[]) ?? [];
}

function hasMetadata(incident: IncidentRecord): boolean {
  const meta = incident.latest_metadata;
  if (!meta) return false;
  return Object.keys(meta).some((k) => !HIDDEN_META_KEYS.has(k));
}

function getVisibleMetadata(incident: IncidentRecord): Record<string, unknown> {
  const meta = incident.latest_metadata ?? {};
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(meta)) {
    if (!HIDDEN_META_KEYS.has(key)) result[key] = val;
  }
  return result;
}

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 16) return hash || '\u2014';
  return hash.slice(0, 10) + '...' + hash.slice(-6);
}

function formatNumber(val: unknown): string {
  if (val == null) return '\u2014';
  const n = Number(val);
  return isNaN(n) ? String(val) : n.toLocaleString();
}

function formatAprValue(val: unknown): string {
  if (val == null) return '\u2014';
  const n = Number(val);
  return isNaN(n) ? String(val) : `${n.toFixed(2)}%`;
}

function formatMetaValue(val: unknown): string {
  if (val == null) return '\u2014';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

// Table setup
const sorting = ref<SortingState>([{ id: 'lastSeen', desc: true }]);
const expanded = ref<ExpandedState>({});

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
    get expanded() { return expanded.value; },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  onExpandedChange: (updater) => {
    expanded.value = typeof updater === 'function' ? updater(expanded.value) : updater;
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  getRowId: (row) => row.id,
  enableExpanding: true,
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

.expand-cell {
  cursor: pointer;
  text-align: center;
  padding: 0.375rem 0.25rem;
}

.expand-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  transition: transform 0.15s;
}

.expanded-parent {
  background: var(--app-surface-elevated);
}

.actions-cell {
  display: flex;
  gap: 0.25rem;
}

.expanded-row {
  background: var(--app-surface-elevated);
}

.expanded-cell {
  padding: 0;
  border-bottom: 2px solid var(--app-surface-border-strong);
}

.expanded-content {
  padding: 0.75rem 1rem 0.75rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.expanded-title {
  font-weight: 600;
  font-size: 0.9rem;
}

.expanded-message {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
  white-space: pre-wrap;
}

.expanded-section h4 {
  margin: 0.25rem 0;
  font-size: 0.85rem;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.detail-table th {
  text-align: left;
  padding: 0.25rem 0.5rem;
  font-weight: 600;
  border-bottom: 1px solid var(--app-surface-border);
  white-space: nowrap;
}

.detail-table td {
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--app-surface-border);
  white-space: nowrap;
}

.mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.error-text {
  color: var(--p-red-500);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.metadata-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.75rem;
  font-size: 0.85rem;
}

.meta-key {
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.meta-value {
  word-break: break-all;
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
