<template>
  <div class="d-flex align-center justify-end" style="padding: 4px 16px;">
    <span class="v-data-table-footer__items-per-page">
      <span>Items per page:</span>
      <v-select
        :model-value="itemsPerPage"
        @update:model-value="$emit('update:itemsPerPage', $event)"
        :items="pageOptions"
        density="compact"
        hide-details
        variant="underlined"
        style="width:5rem;"
      ></v-select>
    </span>
    <span class="v-data-table-footer__info mx-4">{{ rangeText }}</span>
    <nav class="v-data-table-footer__pagination" aria-label="Pagination Navigation">
      <ul class="d-flex align-center" style="list-style:none;padding:0;margin:0;gap:0;">
        <li>
          <v-btn icon variant="text" density="compact" :disabled="page <= 1" @click="$emit('update:page', 1)" aria-label="First page">
            <v-icon>mdi-page-first</v-icon>
          </v-btn>
        </li>
        <li>
          <v-btn icon variant="text" density="compact" :disabled="page <= 1" @click="$emit('update:page', page - 1)" aria-label="Previous page">
            <v-icon>mdi-chevron-left</v-icon>
          </v-btn>
        </li>
        <li>
          <v-btn icon variant="text" density="compact" :disabled="page >= pageCount" @click="$emit('update:page', page + 1)" aria-label="Next page">
            <v-icon>mdi-chevron-right</v-icon>
          </v-btn>
        </li>
        <li>
          <v-btn icon variant="text" density="compact" :disabled="page >= pageCount" @click="$emit('update:page', pageCount)" aria-label="Last page">
            <v-icon>mdi-page-last</v-icon>
          </v-btn>
        </li>
      </ul>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  itemsPerPage: { type: Number, required: true },
  page: { type: Number, required: true },
  totalItems: { type: Number, required: true },
});

defineEmits(['update:itemsPerPage', 'update:page']);

const pageOptions = [
  { title: '25', value: 25 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
  { title: '500', value: 500 },
  { title: 'All', value: -1 },
];

const pageCount = computed(() => {
  if (props.itemsPerPage <= 0 || props.totalItems === 0) return 1;
  return Math.ceil(props.totalItems / props.itemsPerPage);
});

const rangeText = computed(() => {
  if (props.totalItems === 0) return '0-0 of 0';
  const ipp = props.itemsPerPage <= 0 ? props.totalItems : props.itemsPerPage;
  const start = (props.page - 1) * ipp + 1;
  const end = Math.min(props.page * ipp, props.totalItems);
  return `${start}-${end} of ${props.totalItems}`;
});
</script>
