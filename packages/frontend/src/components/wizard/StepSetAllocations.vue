<template>
  <div class="step-set-allocations">
    <!-- Controls -->
    <div class="controls-row">
      <div class="field-inline">
        <label>Min Allocation</label>
        <InputText
          :model-value="String(minAllocation)"
          @update:model-value="$emit('update:minAllocation', Number($event))"
          type="number"
          style="width: 8rem"
        />
      </div>
      <div class="field-inline">
        <label>Min Alloc (0 Signal)</label>
        <InputText
          :model-value="String(minAllocation0Signal)"
          @update:model-value="$emit('update:minAllocation0Signal', Number($event))"
          type="number"
          style="width: 8rem"
        />
      </div>
      <Button
        label="Set Max Allos"
        severity="secondary"
        @click="$emit('setMaxAllos')"
      />
      <Button
        label="Reset Allos"
        severity="secondary"
        @click="$emit('resetAllos')"
      />
    </div>

    <!-- Allocation table -->
    <div v-if="subgraphs.length === 0" class="empty-state">
      No subgraphs selected. Go to Step 3.
    </div>

    <div class="allocation-list">
      <div
        v-for="sub in subgraphs"
        :key="sub.ipfsHash"
        class="allocation-row"
      >
        <div class="row-header">
          <span class="sub-name">{{ sub.displayName }}</span>
          <span class="sub-meta">
            APR {{ formatApr(sub.apr) }}
            <template v-if="sub.wizardApr > 0">
              &rarr; {{ formatApr(sub.wizardApr) }}
            </template>
          </span>
          <span class="sub-meta">Daily {{ sub.wizardDailyRewards.toLocaleString() }} GRT</span>
        </div>
        <div class="row-controls">
          <InputText
            :model-value="String(newAllocations[sub.ipfsHash] ?? 0)"
            @update:model-value="onAllocationInput(sub.ipfsHash, $event)"
            type="number"
            style="width: 10rem"
          />
          <Slider
            :model-value="newAllocations[sub.ipfsHash] ?? 0"
            @update:model-value="onAllocationSlider(sub.ipfsHash, $event)"
            :min="0"
            :max="sliderMax(sub.ipfsHash)"
            :step="1"
            class="allocation-slider"
          />
          <span class="sub-hash">{{ sub.ipfsHash.slice(0, 12) }}...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import InputText from 'primevue/inputtext';
import Slider from 'primevue/slider';
import Button from 'primevue/button';
import { formatApr } from '@indexer-tools/shared';

export interface WizardSubgraphRow {
  ipfsHash: string;
  displayName: string;
  network: string;
  apr: number;
  wizardApr: number;
  wizardDailyRewards: number;
  wizardDailyRewardsCut: number;
  maxAllo: number;
  signalledTokens: bigint;
  deniedAt: number | null;
}

const props = defineProps<{
  subgraphs: WizardSubgraphRow[];
  newAllocations: Record<string, number>;
  availableStakeGrt: number;
  minAllocation: number;
  minAllocation0Signal: number;
}>();

const emit = defineEmits<{
  'update:allocation': [ipfsHash: string, amount: number];
  'update:minAllocation': [value: number];
  'update:minAllocation0Signal': [value: number];
  'setMaxAllos': [];
  'resetAllos': [];
}>();

// Debounced slider updates
const sliderTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function onAllocationSlider(ipfsHash: string, value: number) {
  clearTimeout(sliderTimers[ipfsHash]);
  sliderTimers[ipfsHash] = setTimeout(() => {
    emit('update:allocation', ipfsHash, Math.floor(value));
  }, 100);
}

function onAllocationInput(ipfsHash: string, value: string) {
  const num = parseInt(value, 10);
  emit('update:allocation', ipfsHash, isNaN(num) ? 0 : num);
}

function sliderMax(ipfsHash: string): number {
  const current = props.newAllocations[ipfsHash] ?? 0;
  return Math.max(0, Math.floor(props.availableStakeGrt) + current);
}
</script>

<style scoped>
.controls-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  margin-bottom: 1rem;
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

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.allocation-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.allocation-row {
  border: 1px solid var(--app-surface-border);
  border-radius: var(--p-border-radius);
  padding: 0.75rem 1rem;
}

.row-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.sub-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.sub-meta {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.sub-hash {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-family: monospace;
}

.row-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.allocation-slider {
  flex: 1;
  max-width: 400px;
}
</style>
