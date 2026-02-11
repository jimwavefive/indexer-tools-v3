<template>
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h2>Action Queue</h2>
      <div class="header-actions">
        <Button
          v-if="isConnected"
          icon="pi pi-refresh"
          severity="secondary"
          text
          :loading="loading"
          @click="fetchActions"
        />
      </div>
    </div>

    <!-- Agent URL setup -->
    <div v-if="!isConnected" class="setup-section">
      <p class="muted-text">
        Configure the agent endpoint in Settings &rarr; Accounts to manage actions.
      </p>
    </div>

    <template v-else>
      <!-- Connected header with URL -->
      <div class="agent-bar">
        <span class="agent-url">{{ agentEndpoint }}</span>
        <Button label="Disconnect" severity="secondary" text size="small" @click="disconnectAgent" />
      </div>

      <!-- Summary cards -->
      <div class="summary-cards">
        <div class="summary-card">
          <span class="summary-label">Succeeded</span>
          <span class="summary-value">{{ successCount }}</span>
        </div>
        <div class="summary-card">
          <span class="summary-label">Failed</span>
          <span class="summary-value">{{ failedCount }}</span>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-row">
        <MultiSelect
          v-model="statusFilter"
          :options="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Status Filter"
          class="status-filter"
          :showToggleAll="false"
        />
      </div>

      <!-- Table -->
      <div v-if="loading" class="loading-state">
        <ProgressBar mode="indeterminate" style="height: 4px" />
      </div>

      <div v-else class="table-container">
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                <th class="th-cell" style="width: 40px">
                  <Checkbox
                    :modelValue="table.getIsAllRowsSelected()"
                    :indeterminate="table.getIsSomeRowsSelected()"
                    @update:modelValue="table.toggleAllRowsSelected()"
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
                <td class="td-cell">
                  <Checkbox
                    :modelValue="row.getIsSelected()"
                    @update:modelValue="row.toggleSelected()"
                    :binary="true"
                  />
                </td>
                <td v-for="cell in row.getVisibleCells()" :key="cell.id" class="td-cell">
                  <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                </td>
              </tr>
              <tr v-if="rows.length === 0">
                <td :colspan="columns.length + 1" class="td-cell empty-row">No actions found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="action-buttons">
        <Button
          label="Approve"
          icon="pi pi-check"
          severity="success"
          size="small"
          :disabled="selectedIds.length === 0"
          @click="confirmAction = 'approve'"
        />
        <Button
          label="Cancel"
          icon="pi pi-ban"
          severity="warn"
          size="small"
          :disabled="selectedIds.length === 0"
          @click="confirmAction = 'cancel'"
        />
        <Button
          label="Delete"
          icon="pi pi-trash"
          severity="danger"
          size="small"
          :disabled="selectedIds.length === 0"
          @click="confirmAction = 'delete'"
        />
        <div class="action-spacer" />
        <Button
          label="Execute Approved"
          icon="pi pi-play"
          size="small"
          @click="confirmAction = 'execute'"
        />
      </div>

      <!-- Errors -->
      <div v-if="errors.length > 0" class="errors-section">
        <h4>Errors ({{ errors.length }})</h4>
        <div v-for="(err, i) in errors" :key="i" class="error-item">{{ err }}</div>
      </div>
    </template>

    <!-- Confirmation dialog -->
    <Dialog
      :visible="!!confirmAction"
      @update:visible="confirmAction = null"
      :header="confirmHeaders[confirmAction ?? 'approve']"
      modal
      :style="{ width: '24rem' }"
    >
      <p>
        <template v-if="confirmAction === 'execute'">
          Are you sure you want to execute all approved actions?
        </template>
        <template v-else>
          Are you sure you want to {{ confirmAction }} action IDs: {{ selectedIds.join(', ') }}?
        </template>
      </p>
      <template #footer>
        <Button label="Back" severity="secondary" text @click="confirmAction = null" />
        <Button :label="confirmHeaders[confirmAction ?? 'approve']" @click="executeConfirmedAction" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  useVueTable,
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  FlexRender,
} from '@tanstack/vue-table';
import type { SortingState, RowSelectionState } from '@tanstack/vue-table';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import MultiSelect from 'primevue/multiselect';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import { GraphQLClient } from 'graphql-request';
import { useSettingsStore } from '../composables/state/useSettings';
import { useSnackbar } from '../composables/state/useSnackbar';

interface AgentAction {
  id: string;
  status: string;
  type: string;
  deploymentID: string;
  allocationID: string;
  amount: string;
  poi: string;
  publicPOI: string;
  poiBlockNumber: string;
  force: boolean;
  priority: number;
  source: string;
  reason: string;
  transaction: string;
  failureReason: string;
  protocolNetwork: string;
}

const ACTION_FIELDS = `
  id status type deploymentID allocationID amount poi publicPOI
  poiBlockNumber force priority source reason transaction failureReason
  protocolNetwork
`;

const settingsStore = useSettingsStore();
const snackbar = useSnackbar();

const activeAccount = computed(() => settingsStore.getActiveAccount());
const agentEndpoint = computed(() => activeAccount.value?.agentEndpoint ?? '');
const isConnected = computed(() => !!activeAccount.value?.agentConnect && !!activeAccount.value?.agentEndpoint);
const client = computed(() => {
  if (!isConnected.value || !agentEndpoint.value) return null;
  return new GraphQLClient(agentEndpoint.value);
});
const actions = ref<AgentAction[]>([]);
const loading = ref(false);
const errors = ref<string[]>([]);
const confirmAction = ref<string | null>(null);

const statusOptions = [
  { label: 'Queued', value: 'queued' },
  { label: 'Approved', value: 'approved' },
  { label: 'Pending', value: 'pending' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
  { label: 'Canceled', value: 'canceled' },
];
const statusFilter = ref<string[]>([]);

const confirmHeaders: Record<string, string> = {
  approve: 'Approve Actions',
  cancel: 'Cancel Actions',
  delete: 'Delete Actions',
  execute: 'Execute Approved Actions',
};

const filteredActions = computed(() => {
  if (statusFilter.value.length === 0) return actions.value;
  return actions.value.filter((a) => statusFilter.value.includes(a.status));
});

const successCount = computed(() => actions.value.filter((a) => a.status === 'success').length);
const failedCount = computed(() => actions.value.filter((a) => a.status === 'failed').length);

// Table setup
const sorting = ref<SortingState>([{ id: 'id', desc: true }]);
const rowSelection = ref<RowSelectionState>({});

const selectedIds = computed(() => {
  const selectedRows = table.getSelectedRowModel().rows;
  return selectedRows.map((r) => r.original.id);
});

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 14) return hash || '—';
  return hash.slice(0, 6) + '...' + hash.slice(-4);
}

const colHelper = createColumnHelper<AgentAction>();

const columns = [
  colHelper.accessor('id', { header: 'ID', size: 60 }),
  colHelper.accessor('status', { header: 'Status', size: 90 }),
  colHelper.accessor('priority', { header: 'Priority', size: 80 }),
  colHelper.accessor('type', { header: 'Type', size: 100 }),
  colHelper.accessor('amount', { header: 'Amount', size: 100 }),
  colHelper.accessor('deploymentID', {
    header: 'Deployment',
    size: 160,
    enableSorting: false,
    cell: (info) => truncateHash(info.getValue()),
  }),
  colHelper.accessor('allocationID', {
    header: 'Allocation',
    size: 140,
    enableSorting: false,
    cell: (info) => truncateHash(info.getValue()),
  }),
  colHelper.accessor('transaction', {
    header: 'Transaction',
    size: 130,
    cell: (info) => truncateHash(info.getValue()),
  }),
  colHelper.accessor('failureReason', {
    header: 'Failure',
    size: 120,
    cell: (info) => info.getValue() || '',
  }),
  colHelper.accessor('source', { header: 'Source', size: 80 }),
];

const table = useVueTable({
  get data() { return filteredActions.value; },
  columns,
  state: {
    get sorting() { return sorting.value; },
    get rowSelection() { return rowSelection.value; },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater;
  },
  onRowSelectionChange: (updater) => {
    rowSelection.value = typeof updater === 'function' ? updater(rowSelection.value) : updater;
  },
  getRowId: (row) => row.id,
  enableRowSelection: true,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});

const rows = computed(() => table.getRowModel().rows);

// Agent operations
function disconnectAgent() {
  const acc = activeAccount.value;
  if (acc) acc.agentConnect = false;
  actions.value = [];
}

async function fetchActions() {
  const c = client.value;
  if (!c) return;
  loading.value = true;
  try {
    const data = await c.request<{ actions: AgentAction[] }>(
      `query actions($filter: ActionFilter!) { actions(filter: $filter) { ${ACTION_FIELDS} } }`,
      { filter: {} },
    );
    actions.value = data.actions;
  } catch (err) {
    errors.value.push(String(err));
    snackbar.show('Failed to fetch actions', 'error');
  } finally {
    loading.value = false;
  }
}

async function executeConfirmedAction() {
  const action = confirmAction.value;
  confirmAction.value = null;
  const c = client.value;
  if (!c) return;

  try {
    if (action === 'approve') {
      const data = await c.request<{ approveActions: AgentAction[] }>(
        `mutation approveActions($actionIDs: [String!]!) { approveActions(actionIDs: $actionIDs) { ${ACTION_FIELDS} } }`,
        { actionIDs: selectedIds.value },
      );
      updateActions(data.approveActions);
      snackbar.show(`Approved ${data.approveActions.length} actions`, 'success');
    } else if (action === 'cancel') {
      const data = await c.request<{ cancelActions: AgentAction[] }>(
        `mutation cancelActions($actionIDs: [String!]!) { cancelActions(actionIDs: $actionIDs) { ${ACTION_FIELDS} } }`,
        { actionIDs: selectedIds.value },
      );
      updateActions(data.cancelActions);
      snackbar.show(`Cancelled ${data.cancelActions.length} actions`, 'success');
    } else if (action === 'delete') {
      const ids = selectedIds.value;
      await c.request(
        `mutation deleteActions($actionIDs: [String!]!) { deleteActions(actionIDs: $actionIDs) { ${ACTION_FIELDS} } }`,
        { actionIDs: ids },
      );
      actions.value = actions.value.filter((a) => !ids.includes(a.id));
      snackbar.show(`Deleted ${ids.length} actions`, 'success');
    } else if (action === 'execute') {
      const data = await c.request<{ executeApprovedActions: AgentAction[] }>(
        `mutation executeApprovedActions { executeApprovedActions { ${ACTION_FIELDS} } }`,
      );
      updateActions(data.executeApprovedActions);
      snackbar.show(`Executed ${data.executeApprovedActions.length} actions`, 'success');
    }
    rowSelection.value = {};
  } catch (err) {
    errors.value.push(String(err));
    snackbar.show('Agent error. Check errors for details.', 'error');
  }
}

function updateActions(updated: AgentAction[]) {
  const map = new Map(updated.map((a) => [a.id, a]));
  actions.value = actions.value.map((a) => map.get(a.id) ?? a);
}

// Auto-fetch on mount if connected
if (isConnected.value) fetchActions();
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

.muted-text {
  color: var(--p-text-muted-color);
  margin-bottom: 0.75rem;
}

.setup-section {
  padding: 2rem;
  text-align: center;
}

.agent-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--app-table-header-bg);
  border-radius: 6px;
  font-size: 0.8rem;
}

.agent-url {
  color: var(--p-text-muted-color);
  font-family: monospace;
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

.filter-row {
  margin-bottom: 1rem;
}

.status-filter {
  min-width: 200px;
}

.loading-state {
  padding: 2rem;
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
  background: var(--app-table-header-bg);
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
  background: var(--app-table-row-hover);
}

.empty-row {
  text-align: center;
  color: var(--p-text-muted-color);
  padding: 2rem;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.75rem 0;
}

.action-spacer {
  flex: 1;
}

.errors-section {
  margin-top: 1.5rem;
  padding: 0.75rem;
  border: 1px solid var(--p-red-200);
  border-radius: 8px;
  background: var(--p-red-50);
}

.errors-section h4 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
}

.error-item {
  font-size: 0.8rem;
  color: var(--p-red-600);
  padding: 0.25rem 0;
  word-break: break-all;
}
</style>
