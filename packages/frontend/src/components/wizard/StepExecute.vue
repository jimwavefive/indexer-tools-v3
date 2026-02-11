<template>
  <div class="step-execute">
    <!-- Agent API section (always visible) -->
    <div v-if="isConnected" class="agent-section">
      <div class="agent-bar">
        <span class="agent-badge connected">Connected to indexer-agent API</span>
      </div>

      <!-- Queue button (only when there are actions to queue) -->
      <div v-if="actionInputs.length > 0" class="queue-row">
        <Button
          label="Queue Actions"
          icon="pi pi-send"
          size="small"
          :disabled="loading"
          :loading="loading"
          @click="handleQueueActions"
        />
        <span class="queue-hint">
          {{ actionInputs.length }} action{{ actionInputs.length !== 1 ? 's' : '' }} to queue
        </span>
      </div>

      <!-- Action buttons (always visible) -->
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
          label="Refresh"
          icon="pi pi-refresh"
          severity="secondary"
          size="small"
          :loading="loading"
          @click="fetchActions()"
        />
      </div>

      <!-- Actions table (always visible) -->
      <div class="actions-table-section">
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
                  :style="{ width: `${header.getSize()}px` }"
                  class="th-cell"
                >
                  <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="rows.length === 0">
                <td :colspan="columns.length + 1" class="td-cell no-actions">No actions in queue</td>
              </tr>
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
            </tbody>
          </table>
        </div>
      </div>

      <!-- Errors -->
      <div v-if="errors.length > 0" class="errors-section">
        <div v-for="(err, i) in errors" :key="i" class="error-item">{{ err }}</div>
      </div>
    </div>
    <div v-else>
      <div class="agent-bar">
        <span class="agent-badge disconnected">Not connected to indexer-agent API</span>
      </div>
      <p class="no-agent-hint">Connect to the indexer agent in Settings &rarr; Accounts to queue actions directly.</p>
    </div>

    <!-- CLI commands (collapsible fallback, only when commands exist) -->
    <details v-if="actionsQueueCommands || indexingRuleCommands" class="cli-section">
      <summary class="cli-summary">CLI Commands</summary>
      <div class="command-section">
        <div class="section-header">
          <h3>Action Queue Commands</h3>
          <Button
            label="Copy"
            icon="pi pi-copy"
            severity="secondary"
            size="small"
            @click="copyToClipboard(actionsQueueCommands)"
          />
        </div>
        <Textarea
          :model-value="actionsQueueCommands"
          readonly
          auto-resize
          :rows="6"
          class="command-textarea"
        />
      </div>

      <div class="command-section">
        <div class="section-header">
          <h3>Indexing Rule Commands</h3>
          <Button
            label="Copy"
            icon="pi pi-copy"
            severity="secondary"
            size="small"
            @click="copyToClipboard(indexingRuleCommands)"
          />
        </div>
        <Textarea
          :model-value="indexingRuleCommands"
          readonly
          auto-resize
          :rows="6"
          class="command-textarea"
        />
      </div>
    </details>

    <!-- Confirmation dialog -->
    <Dialog
      :visible="!!confirmAction"
      @update:visible="confirmAction = null"
      :header="confirmHeaders[confirmAction ?? 'approve']"
      modal
      :style="{ width: '24rem' }"
    >
      <p>
        Are you sure you want to {{ confirmAction }} {{ selectedIds.length }} selected action{{ selectedIds.length !== 1 ? 's' : '' }}?
      </p>
      <template #footer>
        <Button label="Back" severity="secondary" text @click="confirmAction = null" />
        <Button :label="confirmHeaders[confirmAction ?? 'approve']" @click="executeConfirmedAction" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, onUnmounted } from 'vue';
import {
  useVueTable,
  createColumnHelper,
  getCoreRowModel,
  FlexRender,
} from '@tanstack/vue-table';
import type { RowSelectionState } from '@tanstack/vue-table';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import {
  useAgentActions,
  type AgentAction,
  type ActionInput,
} from '../../composables/queries/useAgentActions';

const props = defineProps<{
  actionsQueueCommands: string;
  indexingRuleCommands: string;
  actionInputs: ActionInput[];
}>();

const {
  actions,
  loading,
  errors,
  isConnected,
  fetchActions,
  approveActions,
  cancelActions,
  deleteActions,
  queueActions,
} = useAgentActions();

const confirmAction = ref<string | null>(null);

const confirmHeaders: Record<string, string> = {
  approve: 'Approve Actions',
  cancel: 'Cancel Actions',
  delete: 'Delete Actions',
};

// Table setup
const rowSelection = ref<RowSelectionState>({});

const selectedIds = computed(() => {
  const selectedRows = table.getSelectedRowModel().rows;
  return selectedRows.map((r) => String(r.original.id));
});

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 14) return hash || '\u2014';
  return hash.slice(0, 6) + '...' + hash.slice(-4);
}

const colHelper = createColumnHelper<AgentAction>();

const columns = [
  colHelper.accessor('id', { header: 'ID', size: 50 }),
  colHelper.accessor('status', { header: 'Status', size: 80 }),
  colHelper.accessor('type', { header: 'Type', size: 90 }),
  colHelper.accessor('priority', { header: 'Priority', size: 60 }),
  colHelper.accessor('amount', { header: 'Amount', size: 90 }),
  colHelper.accessor('deploymentID', {
    header: 'Deployment',
    size: 150,
    enableSorting: false,
    cell: (info) => truncateHash(info.getValue()),
  }),
  colHelper.accessor('allocationID', {
    header: 'Allocation',
    size: 130,
    enableSorting: false,
    cell: (info) => truncateHash(info.getValue()),
  }),
  colHelper.accessor('transaction', {
    header: 'Tx',
    size: 100,
    cell: (info) => {
      const tx = info.getValue();
      if (!tx) return '';
      return h('a', {
        href: `https://etherscan.io/tx/${tx}`,
        target: '_blank',
        rel: 'noopener',
        class: 'tx-link',
      }, truncateHash(tx));
    },
  }),
  colHelper.accessor('failureReason', {
    header: 'Failure',
    size: 100,
    cell: (info) => info.getValue() || '',
  }),
];

const table = useVueTable({
  get data() { return actions.value; },
  columns,
  state: {
    get rowSelection() { return rowSelection.value; },
  },
  onRowSelectionChange: (updater) => {
    rowSelection.value = typeof updater === 'function' ? updater(rowSelection.value) : updater;
  },
  getRowId: (row) => String(row.id),
  enableRowSelection: true,
  getCoreRowModel: getCoreRowModel(),
});

const rows = computed(() => table.getRowModel().rows);

async function handleQueueActions() {
  await queueActions(props.actionInputs);
}

async function executeConfirmedAction() {
  const action = confirmAction.value;
  confirmAction.value = null;

  if (action === 'approve') {
    await approveActions(selectedIds.value);
  } else if (action === 'cancel') {
    await cancelActions(selectedIds.value);
  } else if (action === 'delete') {
    await deleteActions(selectedIds.value);
  }
  rowSelection.value = {};
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

// Auto-fetch actions on mount + poll every 5s
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  if (isConnected.value) {
    fetchActions();
    pollTimer = setInterval(() => {
      if (isConnected.value && !loading.value) fetchActions();
    }, 5000);
  }
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.step-execute {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.agent-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.agent-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--app-table-header-bg);
  border-radius: 6px;
  font-size: 0.8rem;
}

.agent-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.agent-badge.connected {
  background: #4caf50;
  color: #fff;
}

.agent-badge.disconnected {
  background: #f44336;
  color: #fff;
}

.queue-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.queue-hint {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.no-agent-hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin-top: 0.5rem;
  text-align: center;
}

.no-actions {
  text-align: center;
  color: var(--p-text-muted-color);
  padding: 1.5rem 0.6rem;
}

.actions-table-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.table-scroll {
  border: 1px solid var(--app-surface-border);
  border-radius: 6px;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.th-cell {
  padding: 0.5rem 0.6rem;
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
  border-bottom: 2px solid var(--app-surface-border-strong);
  background: var(--app-table-bg);
}

.td-cell {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--app-surface-border);
  white-space: nowrap;
}

.data-row:hover {
  background: var(--app-table-row-hover);
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.action-spacer {
  flex: 1;
}

.errors-section {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-red-200);
  border-radius: 6px;
}

.error-item {
  font-size: 0.8rem;
  color: var(--p-red-600);
  word-break: break-all;
}

:deep(.tx-link) {
  color: var(--p-primary-color);
  text-decoration: none;
}

:deep(.tx-link:hover) {
  text-decoration: underline;
}

/* CLI collapsible section */
.cli-section {
  border: 1px solid var(--app-surface-border);
  border-radius: 6px;
  overflow: hidden;
}

.cli-summary {
  padding: 0.6rem 0.75rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  background: var(--app-table-header-bg);
  user-select: none;
}

.cli-section[open] .cli-summary {
  border-bottom: 1px solid var(--app-surface-border);
}

.command-section {
  padding: 0.75rem;
}

.command-section h3 {
  margin: 0;
  font-size: 0.9rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.command-textarea {
  width: 100%;
  font-family: monospace;
  font-size: 0.8rem;
}
</style>
