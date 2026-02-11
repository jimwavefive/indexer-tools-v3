<template>
  <div class="step-pick-subgraphs">
    <div class="step-toolbar">
      <p class="step-hint">Select subgraphs to allocate to.</p>
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
      @update:selected="$emit('update:selected', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import SubgraphTable from '../tables/SubgraphTable.vue';
import type { EnrichedSubgraphRow } from '../../composables/queries/useSubgraphs';
import { useSettingsStore } from '../../composables/state/useSettings';

const settingsStore = useSettingsStore();

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
