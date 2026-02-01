<template>
  <router-view />
</template>

<script setup>
  import { useSubgraphSettingStore } from './store/subgraphSettings';
  import { useTableSettingStore } from './store/tableSettings';
  import { useManagerSettingStore } from './store/managerSettings';
  const subgraphSettingsStore = useSubgraphSettingStore();
  const tableSettingsStore = useTableSettingStore();
  const managerSettingStore = useManagerSettingStore();

  subgraphSettingsStore.$subscribe(() => {
    localStorage.subgraphSettings = JSON.stringify(subgraphSettingsStore.settings);
  })

  tableSettingsStore.$subscribe(() => {
    localStorage.subgraphTableSettings = JSON.stringify(tableSettingsStore.subgraphSettings);
    localStorage.allocationTableSettings = JSON.stringify(tableSettingsStore.allocationSettings);
  })

  managerSettingStore.$subscribe(() => {
    localStorage.managerSettings = JSON.stringify(managerSettingStore.settings);
  })

</script>
