<template>
  <div class="feature-flags-settings">
    <p class="hint">Enable or disable features. Changes are saved to your browser.</p>

    <div v-for="flag in featureFlagStore.allFlags()" :key="flag.key" class="flag-row">
      <div class="flag-toggle">
        <ToggleSwitch
          :model-value="flag.enabled"
          @update:model-value="(v: boolean) => featureFlagStore.setFlag(flag.key, v)"
          :input-id="`flag-${flag.key}`"
        />
        <label :for="`flag-${flag.key}`" class="flag-label">{{ flag.label }}</label>
      </div>
      <p class="flag-description">{{ flag.description }}</p>
    </div>

    <Button
      label="Reset to Defaults"
      severity="secondary"
      @click="featureFlagStore.resetToDefaults()"
      class="reset-button"
    />
  </div>
</template>

<script setup lang="ts">
import ToggleSwitch from 'primevue/toggleswitch';
import Button from 'primevue/button';
import { useFeatureFlagStore } from '../../composables/state/useFeatureFlags';

const featureFlagStore = useFeatureFlagStore();
</script>

<style scoped>
.feature-flags-settings {
  max-width: 30rem;
}
.hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin-bottom: 1.5rem;
}
.flag-row {
  margin-bottom: 1.25rem;
}
.flag-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.flag-label {
  font-weight: 500;
}
.flag-description {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin: 0.25rem 0 0 2.75rem;
}
.reset-button {
  margin-top: 1rem;
}
</style>
