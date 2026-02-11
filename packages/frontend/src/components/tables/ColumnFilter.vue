<template>
  <div class="column-filter" v-if="column.getCanFilter()">
    <!-- Text filter -->
    <input
      v-if="filterType === 'text'"
      type="text"
      :value="(column.getFilterValue() as string) ?? ''"
      @input="handleTextInput"
      placeholder="Filter..."
      class="filter-input filter-text"
    />
    <!-- Number range filter -->
    <div v-else-if="filterType === 'number'" class="filter-range">
      <input
        type="number"
        :value="(column.getFilterValue() as [number, number])?.[0] ?? ''"
        @input="handleRangeMin"
        placeholder="Min"
        class="filter-input filter-number"
      />
      <input
        type="number"
        :value="(column.getFilterValue() as [number, number])?.[1] ?? ''"
        @input="handleRangeMax"
        placeholder="Max"
        class="filter-input filter-number"
      />
    </div>
    <!-- Select filter -->
    <select
      v-else-if="filterType === 'select'"
      :value="(column.getFilterValue() as string) ?? ''"
      @change="handleSelectChange"
      class="filter-input filter-select"
    >
      <option value="">All</option>
      <option v-for="opt in options" :key="opt" :value="opt">{{ opt }}</option>
    </select>
  </div>
</template>

<script setup lang="ts">
import type { Column } from '@tanstack/vue-table';

const props = defineProps<{
  column: Column<any, unknown>;
  filterType?: 'text' | 'number' | 'select';
  options?: string[];
}>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debounceSetFilter(value: unknown) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    props.column.setFilterValue(value);
  }, 200);
}

function handleTextInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  debounceSetFilter(val || undefined);
}

function handleRangeMin(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  const current = (props.column.getFilterValue() as [number, number]) ?? [undefined, undefined];
  debounceSetFilter([val ? Number(val) : undefined, current[1]]);
}

function handleRangeMax(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  const current = (props.column.getFilterValue() as [number, number]) ?? [undefined, undefined];
  debounceSetFilter([current[0], val ? Number(val) : undefined]);
}

function handleSelectChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  props.column.setFilterValue(val || undefined);
}
</script>

<style scoped>
.column-filter {
  margin-top: 0.25rem;
}

.filter-input {
  width: 100%;
  padding: 0.15rem 0.35rem;
  font-size: 0.75rem;
  border: 1px solid var(--app-surface-border);
  border-radius: 3px;
  background: var(--app-surface-elevated);
  color: var(--p-text-color);
  outline: none;
}

.filter-input:focus {
  border-color: var(--p-primary-color);
}

.filter-input::placeholder {
  color: var(--p-text-muted-color);
  opacity: 0.6;
}

.filter-range {
  display: flex;
  gap: 0.15rem;
}

.filter-number {
  width: 50%;
}

/* Hide number input spinners */
.filter-number::-webkit-outer-spin-button,
.filter-number::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.filter-number[type='number'] {
  -moz-appearance: textfield;
}

.filter-select {
  cursor: pointer;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23999'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.35rem center;
  padding-right: 1.2rem;
}
</style>
