<template>
  <div class="dashboard-columns">
    <div class="columns-grid">
      <!-- Allocation Columns -->
      <div class="column-panel">
        <div class="panel-header">
          <h3>Allocation Columns</h3>
          <Button
            label="Reset"
            severity="secondary"
            size="small"
            @click="settingsStore.resetAllocationColumns()"
          />
        </div>
        <div class="column-list">
          <div
            v-for="(col, idx) in settingsStore.state.allocationColumns"
            :key="col.id"
            class="column-item"
          >
            <Checkbox
              v-model="col.visible"
              :binary="true"
              :input-id="`alloc-col-${col.id}`"
            />
            <label :for="`alloc-col-${col.id}`" class="column-label">
              {{ col.title }}
            </label>
            <div class="column-arrows">
              <Button
                icon="pi pi-chevron-up"
                text
                severity="secondary"
                size="small"
                :disabled="idx === 0"
                @click="settingsStore.moveColumn('allocationColumns', idx, idx - 1)"
              />
              <Button
                icon="pi pi-chevron-down"
                text
                severity="secondary"
                size="small"
                :disabled="idx === settingsStore.state.allocationColumns.length - 1"
                @click="settingsStore.moveColumn('allocationColumns', idx, idx + 1)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Subgraph Columns -->
      <div class="column-panel">
        <div class="panel-header">
          <h3>Subgraph Columns</h3>
          <Button
            label="Reset"
            severity="secondary"
            size="small"
            @click="settingsStore.resetSubgraphColumns()"
          />
        </div>
        <div class="column-list">
          <div
            v-for="(col, idx) in settingsStore.state.subgraphColumns"
            :key="col.id"
            class="column-item"
          >
            <Checkbox
              v-model="col.visible"
              :binary="true"
              :input-id="`sub-col-${col.id}`"
            />
            <label :for="`sub-col-${col.id}`" class="column-label">
              {{ col.title }}
            </label>
            <div class="column-arrows">
              <Button
                icon="pi pi-chevron-up"
                text
                severity="secondary"
                size="small"
                :disabled="idx === 0"
                @click="settingsStore.moveColumn('subgraphColumns', idx, idx - 1)"
              />
              <Button
                icon="pi pi-chevron-down"
                text
                severity="secondary"
                size="small"
                :disabled="idx === settingsStore.state.subgraphColumns.length - 1"
                @click="settingsStore.moveColumn('subgraphColumns', idx, idx + 1)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import { useSettingsStore } from '../../composables/state/useSettings';

const settingsStore = useSettingsStore();
</script>

<style scoped>
.columns-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
}
.column-panel {
  min-width: 18rem;
  max-width: 28rem;
  flex: 1;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.panel-header h3 {
  margin: 0;
}
.column-list {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.column-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border-radius: var(--p-border-radius);
  border: 1px solid var(--app-surface-border);
}
.column-label {
  flex: 1;
  font-size: 0.875rem;
}
.column-arrows {
  display: flex;
  flex-direction: column;
}
</style>
