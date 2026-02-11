<template>
  <div class="step-pick-subgraphs">
    <div class="step-toolbar">
      <p class="step-hint">Select subgraphs to allocate to.</p>
      <div class="filter-item checkbox-item">
        <Checkbox v-model="settingsStore.state.limitToIndexerChains" :binary="true" input-id="lic-wizard" />
        <label for="lic-wizard">Limit GQL to Indexer's chains</label>
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
import Checkbox from 'primevue/checkbox';
import SubgraphTable from '../tables/SubgraphTable.vue';
import type { EnrichedSubgraphRow } from '../../composables/queries/useSubgraphs';
import { useSettingsStore } from '../../composables/state/useSettings';

const settingsStore = useSettingsStore();

defineProps<{
  data: EnrichedSubgraphRow[];
  loading: boolean;
  tableHeight: number;
}>();

defineEmits<{
  'update:selected': [ipfsHashes: string[]];
}>();
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

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.checkbox-item label {
  font-size: 0.85rem;
}
</style>
