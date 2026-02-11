<template>
  <div class="dashboard-page">
    <div class="dashboard-header">
      <h2>Offchain Sync Manager</h2>
      <div class="header-actions">
        <Button
          v-if="isConnected"
          icon="pi pi-refresh"
          severity="secondary"
          text
          :loading="loading"
          @click="fetchSyncs"
        />
      </div>
    </div>

    <!-- Agent URL setup -->
    <div v-if="!isConnected" class="setup-section">
      <p class="muted-text">Connect to your indexer agent to manage offchain syncs.</p>
      <div class="url-input-row">
        <InputText
          v-model="urlInput"
          placeholder="http://localhost:8000/network"
          class="url-input"
        />
        <Button label="Connect" @click="connectAgent" :disabled="!urlInput" />
      </div>
    </div>

    <template v-else>
      <!-- Connected header with URL -->
      <div class="agent-bar">
        <span class="agent-url">{{ agentUrl }}</span>
        <Button label="Disconnect" severity="secondary" text size="small" @click="disconnectAgent" />
      </div>

      <!-- Add / Remove -->
      <div class="manage-row">
        <div class="manage-field">
          <InputText v-model="addInput" placeholder="Deployment IPFS hash" class="hash-input" />
          <Button label="Add Deployment" size="small" :disabled="!addInput" @click="confirmAdd = true" />
        </div>
        <div class="manage-field">
          <InputText v-model="removeInput" placeholder="Deployment IPFS hash" class="hash-input" />
          <Button label="Remove Deployment" severity="warn" size="small" :disabled="!removeInput" @click="confirmRemoveSingle = true" />
        </div>
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
                  :style="{ width: `${header.getSize()}px` }"
                  class="th-cell"
                >
                  <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
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
                <td :colspan="columns.length + 1" class="td-cell empty-row">No offchain syncs found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Bulk remove -->
      <div class="action-buttons">
        <Button
          label="Remove Selected"
          icon="pi pi-trash"
          severity="danger"
          size="small"
          :disabled="selectedIdentifiers.length === 0"
          @click="confirmRemoveBulk = true"
        />
      </div>
    </template>

    <!-- Add confirmation dialog -->
    <Dialog :visible="confirmAdd" @update:visible="confirmAdd = $event" header="Add to Offchain Sync" modal :style="{ width: '24rem' }">
      <p>Add <code>{{ addInput }}</code> to offchain sync list?</p>
      <template #footer>
        <Button label="Back" severity="secondary" text @click="confirmAdd = false" />
        <Button label="Add" @click="addSync" />
      </template>
    </Dialog>

    <!-- Remove single confirmation dialog -->
    <Dialog :visible="confirmRemoveSingle" @update:visible="confirmRemoveSingle = $event" header="Remove from Offchain Sync" modal :style="{ width: '24rem' }">
      <p>Remove <code>{{ removeInput }}</code> from offchain sync list?</p>
      <template #footer>
        <Button label="Back" severity="secondary" text @click="confirmRemoveSingle = false" />
        <Button label="Remove" severity="danger" @click="removeSingleSync" />
      </template>
    </Dialog>

    <!-- Remove bulk confirmation dialog -->
    <Dialog :visible="confirmRemoveBulk" @update:visible="confirmRemoveBulk = $event" header="Remove Offchain Syncs" modal :style="{ width: '24rem' }">
      <p>Remove {{ selectedIdentifiers.length }} offchain syncs?</p>
      <template #footer>
        <Button label="Back" severity="secondary" text @click="confirmRemoveBulk = false" />
        <Button label="Remove" severity="danger" @click="removeBulkSyncs" />
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
  FlexRender,
} from '@tanstack/vue-table';
import type { RowSelectionState } from '@tanstack/vue-table';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import { useAgentConnect } from '../composables/util/useAgentConnect';
import { useChainStore } from '../composables/state/useChain';
import { useSnackbar } from '../composables/state/useSnackbar';

interface IndexingRule {
  identifier: string;
  identifierType: string;
  decisionBasis: string;
}

const { agentUrl, isConnected, client, setAgentUrl } = useAgentConnect();
const chainStore = useChainStore();
const snackbar = useSnackbar();

const urlInput = ref(agentUrl.value);
const syncs = ref<IndexingRule[]>([]);
const loading = ref(false);
const addInput = ref('');
const removeInput = ref('');
const confirmAdd = ref(false);
const confirmRemoveSingle = ref(false);
const confirmRemoveBulk = ref(false);

// Table setup
const rowSelection = ref<RowSelectionState>({});

const selectedIdentifiers = computed(() => {
  const selectedRows = table.getSelectedRowModel().rows;
  return selectedRows.map((r) => r.original.identifier);
});

const colHelper = createColumnHelper<IndexingRule>();

const columns = [
  colHelper.accessor('identifier', { header: 'Identifier', size: 500 }),
  colHelper.accessor('identifierType', { header: 'ID Type', size: 150 }),
  colHelper.accessor('decisionBasis', { header: 'Decision Basis', size: 150 }),
];

const table = useVueTable({
  get data() { return syncs.value; },
  columns,
  state: {
    get rowSelection() { return rowSelection.value; },
  },
  onRowSelectionChange: (updater) => {
    rowSelection.value = typeof updater === 'function' ? updater(rowSelection.value) : updater;
  },
  getRowId: (row) => row.identifier,
  enableRowSelection: true,
  getCoreRowModel: getCoreRowModel(),
});

const rows = computed(() => table.getRowModel().rows);

// Agent operations
function connectAgent() {
  setAgentUrl(urlInput.value);
  fetchSyncs();
}

function disconnectAgent() {
  setAgentUrl('');
  syncs.value = [];
  urlInput.value = '';
}

async function fetchSyncs() {
  const c = client.value;
  if (!c) return;
  loading.value = true;
  try {
    const data = await c.request<{ indexingRules: IndexingRule[] }>(
      `query indexingRules($protocolNetwork: String) {
        indexingRules(protocolNetwork: $protocolNetwork) {
          identifier identifierType decisionBasis
        }
      }`,
      { protocolNetwork: chainStore.activeChainId },
    );
    syncs.value = data.indexingRules.filter((r) => r.decisionBasis === 'offchain');
  } catch (err) {
    snackbar.show('Failed to fetch offchain syncs', 'error');
  } finally {
    loading.value = false;
  }
}

async function addSync() {
  confirmAdd.value = false;
  const c = client.value;
  if (!c || !addInput.value) return;
  try {
    await c.request(
      `mutation setIndexingRule($rule: IndexingRuleInput!) {
        setIndexingRule(rule: $rule) { identifier decisionBasis }
      }`,
      {
        rule: {
          identifier: addInput.value.trim(),
          identifierType: 'deployment',
          decisionBasis: 'offchain',
          protocolNetwork: chainStore.activeChainId,
        },
      },
    );
    snackbar.show(`Added ${addInput.value.slice(0, 7)}... to offchain sync`, 'success');
    addInput.value = '';
    fetchSyncs();
  } catch (err) {
    snackbar.show('Failed to add offchain sync', 'error');
  }
}

async function removeSingleSync() {
  confirmRemoveSingle.value = false;
  await removeSync(removeInput.value.trim());
  removeInput.value = '';
  fetchSyncs();
}

async function removeBulkSyncs() {
  confirmRemoveBulk.value = false;
  for (const id of selectedIdentifiers.value) {
    await removeSync(id);
  }
  rowSelection.value = {};
  fetchSyncs();
}

async function removeSync(identifier: string) {
  const c = client.value;
  if (!c) return;
  try {
    await c.request(
      `mutation deleteIndexingRule($identifier: IndexingRuleIdentifier!) {
        deleteIndexingRule(identifier: $identifier) { identifier }
      }`,
      {
        identifier: {
          identifier,
          protocolNetwork: chainStore.activeChainId,
        },
      },
    );
    snackbar.show('Removed from offchain sync', 'success');
  } catch (err) {
    snackbar.show('Failed to remove offchain sync', 'error');
  }
}

// Auto-fetch on mount if connected
if (isConnected.value) fetchSyncs();
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

.url-input-row {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  max-width: 500px;
  margin: 0 auto;
}

.url-input {
  flex: 1;
}

.agent-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  background: var(--p-surface-50);
  border-radius: 6px;
  font-size: 0.8rem;
}

.agent-url {
  color: var(--p-text-muted-color);
  font-family: monospace;
}

.manage-row {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.manage-field {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.hash-input {
  width: 320px;
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
  background: var(--p-surface-50);
  user-select: none;
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

.action-buttons {
  margin-top: 1rem;
  padding: 0.75rem 0;
}
</style>
