<template>
  <div class="step-pick-subgraphs">
    <p class="step-hint">Select subgraphs to allocate to.</p>
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
import SubgraphTable from '../tables/SubgraphTable.vue';
import type { EnrichedSubgraphRow } from '../../composables/queries/useSubgraphs';

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
.step-hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin-bottom: 0.75rem;
}
</style>
