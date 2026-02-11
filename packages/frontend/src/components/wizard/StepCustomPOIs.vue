<template>
  <div class="step-custom-pois">
    <p class="step-hint">
      Optionally set custom POIs for closing allocations. Enter "0x0" for a zero POI.
      Leave blank to use automatic POI.
    </p>

    <div v-if="closingAllocations.length === 0" class="empty-state">
      No allocations selected for closing. Go to Step 1.
    </div>

    <div
      v-for="allo in closingAllocations"
      :key="allo.id"
      class="poi-card"
    >
      <div class="poi-header">
        <strong>{{ allo.displayName }}</strong>
        <span class="poi-hash">{{ allo.ipfsHash }}</span>
      </div>
      <div class="poi-fields">
        <div class="field">
          <label>POI</label>
          <InputText
            :model-value="customPOIs[allo.ipfsHash] ?? ''"
            @update:model-value="customPOIs[allo.ipfsHash] = $event"
            placeholder="0x..."
            class="full-width"
          />
        </div>
        <div class="field">
          <label>Block Height</label>
          <InputText
            :model-value="customBlockHeights[allo.ipfsHash] ?? ''"
            @update:model-value="customBlockHeights[allo.ipfsHash] = $event"
            placeholder="Block number"
            style="width: 12rem"
          />
        </div>
        <div class="field">
          <label>Public POI</label>
          <InputText
            :model-value="customPublicPOIs[allo.ipfsHash] ?? ''"
            @update:model-value="customPublicPOIs[allo.ipfsHash] = $event"
            placeholder="0x..."
            class="full-width"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import InputText from 'primevue/inputtext';
import type { EnrichedAllocationRow } from '../../composables/queries/useAllocations';

defineProps<{
  closingAllocations: EnrichedAllocationRow[];
  customPOIs: Record<string, string>;
  customBlockHeights: Record<string, string>;
  customPublicPOIs: Record<string, string>;
}>();
</script>

<style scoped>
.step-hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin-bottom: 1rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.poi-card {
  border: 1px solid var(--p-surface-200);
  border-radius: var(--p-border-radius);
  padding: 1rem;
  margin-bottom: 0.75rem;
}

:deep(.dark-mode) .poi-card {
  border-color: var(--p-surface-700);
}

.poi-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.poi-hash {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-family: monospace;
}

.poi-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 15rem;
}

.field label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.full-width {
  width: 100%;
}
</style>
