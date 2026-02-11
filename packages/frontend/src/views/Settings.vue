<template>
  <div class="settings-page">
    <h2 class="page-title">Settings</h2>
    <Tabs :value="activeTab" @update:value="activeTab = $event">
      <TabList>
        <Tab value="general">
          <i class="pi pi-cog" style="margin-right: 0.5rem" />
          General
        </Tab>
        <Tab value="dashboards">
          <i class="pi pi-table" style="margin-right: 0.5rem" />
          Dashboards
        </Tab>
        <Tab value="accounts">
          <i class="pi pi-user" style="margin-right: 0.5rem" />
          Accounts
        </Tab>
        <Tab value="rpcs">
          <i class="pi pi-globe" style="margin-right: 0.5rem" />
          RPCs
        </Tab>
        <Tab value="feature-flags">
          <i class="pi pi-flag" style="margin-right: 0.5rem" />
          Feature Flags
        </Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="general">
          <GeneralSettings />
        </TabPanel>
        <TabPanel value="dashboards">
          <DashboardColumns />
        </TabPanel>
        <TabPanel value="accounts">
          <AccountsManager />
        </TabPanel>
        <TabPanel value="rpcs">
          <RpcSettings />
        </TabPanel>
        <TabPanel value="feature-flags">
          <FeatureFlagsSettings />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import GeneralSettings from '../components/settings/GeneralSettings.vue';
import DashboardColumns from '../components/settings/DashboardColumns.vue';
import AccountsManager from '../components/settings/AccountsManager.vue';
import RpcSettings from '../components/settings/RpcSettings.vue';
import FeatureFlagsSettings from '../components/settings/FeatureFlagsSettings.vue';

const activeTab = ref('general');
</script>

<style scoped>
.settings-page {
  max-width: 60rem;
}
.page-title {
  margin-top: 0;
  margin-bottom: 1rem;
}
</style>
