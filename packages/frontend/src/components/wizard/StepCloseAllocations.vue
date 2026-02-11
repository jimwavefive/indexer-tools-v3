<template>
  <div class="step-close-allocations">
    <p class="step-hint">Select allocations to close. These will be unallocated or reallocated in Step 5.</p>
    <AllocationTable
      :data="data"
      :loading="loading"
      :selectable="true"
      :table-height="tableHeight"
      :totals="totals"
      @update:selected="$emit('update:selected', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import AllocationTable from '../tables/AllocationTable.vue';
import type { EnrichedAllocationRow, AllocationTotals } from '../../composables/queries/useAllocations';

defineProps<{
  data: EnrichedAllocationRow[];
  loading: boolean;
  tableHeight: number;
  totals: AllocationTotals;
}>();

defineEmits<{
  'update:selected': [allocationIds: string[]];
}>();
</script>

<style scoped>
.step-hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin-bottom: 0.75rem;
}
</style>
