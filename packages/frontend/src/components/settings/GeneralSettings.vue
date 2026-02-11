<template>
  <div class="general-settings">
    <div class="setting-group">
      <ToggleSwitch
        v-model="settingsStore.state.automaticIndexingRewards"
        input-id="auto-indexing"
      />
      <label for="auto-indexing" class="setting-label">
        Automatic Indexing Rewards *
      </label>
    </div>
    <p class="setting-hint">
      * Only functions with custom RPCs.
      Disable if there are issues with allocation wizard.
    </p>

    <div class="setting-group" style="margin-top: 1.5rem">
      <label class="setting-label">Auto-Refresh Interval</label>
      <Select
        :model-value="appStore.autoRefreshInterval"
        :options="refreshOptions"
        option-label="label"
        option-value="value"
        style="min-width: 12rem"
        @update:model-value="(v: number) => appStore.setAutoRefreshInterval(v)"
      />
    </div>

    <h3 style="margin-top: 2rem">Subgraph Sync List (Manual)</h3>
    <Textarea
      v-model="settingsStore.state.subgraphSynclist"
      rows="3"
      auto-resize
      class="full-width"
    />

    <h3 style="margin-top: 1.5rem">Subgraph Blacklist (from file)</h3>
    <template v-if="settingsStore.fileBlacklist.length">
      <Textarea
        :model-value="settingsStore.fileBlacklist.join('\n')"
        rows="3"
        readonly
        class="full-width readonly-textarea"
      />
      <p class="setting-hint">
        Loaded from blacklist.txt ({{ settingsStore.fileBlacklist.length }} entries)
      </p>
    </template>
    <p v-else class="setting-hint">No blacklist file loaded</p>

    <h3 style="margin-top: 1.5rem">Subgraph Blacklist (Manual)</h3>
    <Textarea
      v-model="settingsStore.state.subgraphBlacklist"
      rows="3"
      auto-resize
      class="full-width"
    />
  </div>
</template>

<script setup lang="ts">
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { useSettingsStore } from '../../composables/state/useSettings';
import { useAppStore } from '../../composables/state/useApp';

const settingsStore = useSettingsStore();
const appStore = useAppStore();

const refreshOptions = [
  { label: 'Off', value: 0 },
  { label: '1 minute', value: 60000 },
  { label: '2 minutes', value: 120000 },
  { label: '5 minutes', value: 300000 },
  { label: '10 minutes', value: 600000 },
];
</script>

<style scoped>
.general-settings {
  max-width: 40rem;
}
.setting-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.setting-label {
  font-weight: 500;
}
.setting-hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin-top: 0.25rem;
}
.full-width {
  width: 100%;
}
.readonly-textarea {
  opacity: 0.7;
}
</style>
