<template>
  <div class="step-pick-subgraphs">
    <div class="step-toolbar">
      <div class="toolbar-left">
        <p class="step-hint">Select subgraphs to allocate to.</p>
        <Button
          v-if="isConnected && selectedHashes.length > 0"
          :label="`Add ${selectedHashes.length} to Offchain Sync`"
          icon="pi pi-cloud-upload"
          severity="secondary"
          size="small"
          :loading="syncLoading"
          @click="handleAddToSync"
        />
      </div>
      <div class="toolbar-controls">
        <div class="filter-item field-inline">
          <label>Target APR (%)</label>
          <InputText
            v-model="settingsStore.state.targetApr"
            type="number"
            :disabled="autoTargetApr"
            style="width: 7rem"
          />
        </div>
        <div class="filter-item checkbox-item">
          <Checkbox v-model="localAutoTargetApr" :binary="true" input-id="auto-apr-wizard" />
          <label for="auto-apr-wizard">Auto Target APR</label>
        </div>
        <div class="filter-item checkbox-item">
          <Checkbox v-model="settingsStore.state.hideCurrentlyAllocated" :binary="true" input-id="hca-wizard" />
          <label for="hca-wizard">Hide Allocated</label>
        </div>
        <div class="filter-item checkbox-item">
          <Checkbox v-model="settingsStore.state.activateBlacklist" :binary="true" input-id="bl-wizard" />
          <label for="bl-wizard">Hide Blacklisted</label>
        </div>
        <div class="filter-item checkbox-item">
          <Checkbox v-model="settingsStore.state.limitToIndexerChains" :binary="true" input-id="lic-wizard" />
          <label for="lic-wizard">Limit GQL to Indexer's chains</label>
        </div>
      </div>
    </div>
    <SubgraphTable
      :data="data"
      :loading="loading"
      :selectable="true"
      :table-height="tableHeight"
      @update:selected="onSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import SubgraphTable from '../tables/SubgraphTable.vue';
import type { EnrichedSubgraphRow } from '../../composables/queries/useSubgraphs';
import { useSettingsStore } from '../../composables/state/useSettings';
import { useAgentActions } from '../../composables/queries/useAgentActions';

const settingsStore = useSettingsStore();
const { isConnected, addToOffchainSync } = useAgentActions();

const props = defineProps<{
  data: EnrichedSubgraphRow[];
  loading: boolean;
  tableHeight: number;
  autoTargetApr: boolean;
}>();

const emit = defineEmits<{
  'update:selected': [ipfsHashes: string[]];
  'update:autoTargetApr': [value: boolean];
}>();

// Track selected hashes locally for the sync button
const selectedHashes = ref<string[]>([]);
const syncLoading = ref(false);

function onSelected(hashes: string[]) {
  selectedHashes.value = hashes;
  emit('update:selected', hashes);
}

async function handleAddToSync() {
  syncLoading.value = true;
  try {
    await addToOffchainSync(selectedHashes.value);
  } finally {
    syncLoading.value = false;
  }
}

// Local toggle synced to parent
const localAutoTargetApr = ref(props.autoTargetApr);
watch(() => props.autoTargetApr, (v) => { localAutoTargetApr.value = v; });
watch(localAutoTargetApr, (v) => { emit('update:autoTargetApr', v); });
</script>

<style scoped>
.step-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.step-hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin: 0;
}

.toolbar-controls {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}

.field-inline {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-inline label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.checkbox-item label {
  font-size: 0.85rem;
}
</style>
