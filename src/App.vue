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

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  const persistSubgraphSettings = debounce(() => {
    localStorage.subgraphSettings = JSON.stringify(subgraphSettingsStore.settings);
  }, 500);

  const persistTableSettings = debounce(() => {
    localStorage.subgraphTableSettings = JSON.stringify(tableSettingsStore.subgraphSettings);
    localStorage.allocationTableSettings = JSON.stringify(tableSettingsStore.allocationSettings);
  }, 500);

  const persistManagerSettings = debounce(() => {
    localStorage.managerSettings = JSON.stringify(managerSettingStore.settings);
  }, 500);

  subgraphSettingsStore.$subscribe(persistSubgraphSettings);
  tableSettingsStore.$subscribe(persistTableSettings);
  managerSettingStore.$subscribe(persistManagerSettings);

</script>
