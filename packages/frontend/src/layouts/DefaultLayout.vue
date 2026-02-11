<template>
  <div class="app-layout">
    <!-- Top bar -->
    <Toolbar class="app-toolbar">
      <template #start>
        <Button
          icon="pi pi-bars"
          text
          severity="secondary"
          @click="appStore.sidebarOpen = true"
          aria-label="Menu"
        />
        <span class="app-title">
          <i class="pi pi-wrench" style="margin-right: 0.5rem" />
          Indexer Tools v4
        </span>
        <!-- Chain selector — only on /settings -->
        <Select
          v-if="route.path === '/settings'"
          :model-value="chainStore.activeChainId"
          :options="chainOptions"
          option-label="label"
          option-value="value"
          class="chain-select"
          @update:model-value="(v: ChainId) => chainStore.setActiveChain(v)"
        />
      </template>
      <template #end>
        <Button
          label="Wizard"
          icon="pi pi-th-large"
          text
          severity="secondary"
          as="router-link"
          to="/wizard"
        />
        <Button
          v-if="featureFlagStore.isEnabled('notifications')"
          label="Notifications"
          icon="pi pi-bell"
          text
          severity="secondary"
          as="router-link"
          to="/notifications"
        />
        <Button
          :icon="appStore.theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'"
          text
          severity="secondary"
          @click="appStore.toggleTheme()"
          aria-label="Toggle theme"
        />
        <!-- Account selector -->
        <span
          v-if="activeAccount"
          class="account-badge account-badge-clickable"
          @click="toggleAccountPopover"
        >
          {{ activeAccount.name || truncateAddress(activeAccount.address) }}
          <i class="pi pi-chevron-down" style="font-size: 0.7rem; margin-left: 0.25rem" />
        </span>
        <Popover ref="accountPopoverRef">
          <div class="account-popover">
            <div
              v-for="acc in settingsStore.state.accounts"
              :key="acc.address + acc.chain"
              class="account-option"
              :class="{ active: acc.active }"
              @click="selectAccount(acc)"
            >
              <div class="account-option-name">
                {{ acc.name || truncateAddress(acc.address) }}
              </div>
              <div class="account-option-addr">
                {{ truncateAddress(acc.address) }} ({{ acc.chain }})
              </div>
            </div>
          </div>
        </Popover>
      </template>
    </Toolbar>

    <!-- Sidebar drawer -->
    <Drawer
      v-model:visible="appStore.sidebarOpen"
      header="Navigation"
      class="app-drawer"
    >
      <nav class="nav-list">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          @click="appStore.sidebarOpen = false"
        >
          {{ item.label }}
        </router-link>
      </nav>
    </Drawer>

    <!-- Main content -->
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import Toolbar from 'primevue/toolbar';
import Button from 'primevue/button';
import Select from 'primevue/select';
import Drawer from 'primevue/drawer';
import Popover from 'primevue/popover';
import type { ChainId } from '@indexer-tools/shared';
import { CHAIN_CONFIGS } from '@indexer-tools/shared';
import { useChainStore } from '../composables/state/useChain';
import { useAppStore } from '../composables/state/useApp';
import { useFeatureFlagStore } from '../composables/state/useFeatureFlags';
import { useSettingsStore } from '../composables/state/useSettings';

const route = useRoute();
const chainStore = useChainStore();
const appStore = useAppStore();
const featureFlagStore = useFeatureFlagStore();
const settingsStore = useSettingsStore();

const chainOptions = Object.keys(CHAIN_CONFIGS).map((id) => ({
  label: id,
  value: id,
}));

const activeAccount = computed(() => settingsStore.getActiveAccount());

const navItems = computed(() => {
  const items = [
    { label: 'Actions Manager', to: '/actions-manager' },
    { label: 'Allocations Dashboard', to: '/allocations' },
    { label: 'Allocation Wizard', to: '/wizard' },
    { label: 'Deployment Status', to: '/status-dashboard' },
  ];
  if (featureFlagStore.isEnabled('notifications')) {
    items.push({ label: 'Notifications', to: '/notifications' });
  }
  items.push(
    { label: 'Offchain Sync Manager', to: '/offchain-manager' },
    { label: 'QoS Dashboard', to: '/qos-dashboard' },
    { label: 'Query Fee Dashboard', to: '/query-dashboard' },
    { label: 'Settings', to: '/settings' },
    { label: 'Subgraphs Dashboard', to: '/subgraphs' },
  );
  return items;
});

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Account popover
const accountPopoverRef = ref();

function toggleAccountPopover(event: Event) {
  accountPopoverRef.value?.toggle(event);
}

function selectAccount(acc: import('../plugins/defaults').Account) {
  settingsStore.switchAccount(acc.address, acc.chain);
  accountPopoverRef.value?.hide();
}
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-toolbar {
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
}

.app-title {
  font-weight: 600;
  font-size: 1.1rem;
  white-space: nowrap;
  margin-left: 0.5rem;
}

.chain-select {
  margin-left: 1rem;
  min-width: 10rem;
}

.account-badge {
  font-size: 0.85rem;
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  background: var(--app-badge-bg);
  color: var(--app-badge-text);
  white-space: nowrap;
}

.account-badge-clickable {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
}

.account-badge-clickable:hover {
  filter: brightness(0.9);
}

.account-popover {
  display: flex;
  flex-direction: column;
  min-width: 14rem;
}

.account-option {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-radius: var(--p-border-radius);
  transition: background 0.15s;
}

.account-option:hover {
  background: var(--app-table-row-hover);
}

.account-option.active {
  background: var(--app-surface-elevated);
  font-weight: 600;
}

.account-option-name {
  font-size: 0.85rem;
}

.account-option-addr {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-family: monospace;
}

.nav-list {
  display: flex;
  flex-direction: column;
}

.nav-item {
  padding: 0.625rem 1rem;
  text-decoration: none;
  color: var(--p-text-color);
  border-radius: var(--p-border-radius);
  transition: background 0.15s;
}

.nav-item:hover {
  background: var(--app-table-row-hover);
}

.nav-item.router-link-active {
  color: var(--p-primary-color);
  font-weight: 600;
}

.app-main {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}
</style>
