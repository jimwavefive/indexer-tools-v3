<template>
  <div class="blacklist-manager">
    <p class="hint-text">
      Blacklisted deployment hashes are excluded from subgraph listings.
      Entries are persisted in the backend database.
    </p>

    <!-- Add entry -->
    <div class="add-row">
      <InputText
        v-model="newHash"
        placeholder="Qm... or 0x..."
        class="hash-input"
      />
      <Button
        label="Add"
        icon="pi pi-plus"
        size="small"
        :disabled="!newHash.trim()"
        :loading="addEntry.isPending.value"
        @click="handleAdd"
      />
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="loading-state">
      <ProgressBar mode="indeterminate" style="height: 4px" />
    </div>

    <!-- Entries list -->
    <div v-else-if="entries?.length" class="entries-list">
      <div v-for="entry in entries" :key="entry.ipfsHash" class="entry-row">
        <span class="entry-hash">{{ entry.ipfsHash }}</span>
        <span class="entry-source">{{ entry.source }}</span>
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          @click="handleRemove(entry.ipfsHash)"
        />
      </div>
    </div>
    <div v-else class="empty-state">
      No blacklisted deployments.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { useBlacklist } from '../../composables/queries/useBlacklist';
import { useSnackbar } from '../../composables/state/useSnackbar';

const { entries, isLoading, addEntry, removeEntry } = useBlacklist();
const snackbar = useSnackbar();

const newHash = ref('');

async function handleAdd() {
  const hash = newHash.value.trim();
  if (!hash) return;
  try {
    await addEntry.mutateAsync(hash);
    newHash.value = '';
    snackbar.success('Blacklist entry added');
  } catch {
    snackbar.error('Failed to add blacklist entry');
  }
}

async function handleRemove(hash: string) {
  try {
    await removeEntry.mutateAsync(hash);
    snackbar.success('Blacklist entry removed');
  } catch {
    snackbar.error('Failed to remove blacklist entry');
  }
}
</script>

<style scoped>
.blacklist-manager {
  max-width: 40rem;
}

.hint-text {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin-bottom: 1rem;
}

.add-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.hash-input {
  flex: 1;
  font-family: monospace;
  font-size: 0.85rem;
}

.loading-state {
  padding: 1rem 0;
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.entry-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.375rem 0.5rem;
  border-bottom: 1px solid var(--app-surface-border);
}

.entry-hash {
  flex: 1;
  font-family: monospace;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-source {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
