<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="app-title">Indexer Tools v4</div>
      <nav class="app-nav">
        <router-link to="/wizard">Wizard</router-link>
        <router-link to="/notifications">Notifications</router-link>
      </nav>
    </header>
    <div class="app-body">
      <aside class="app-sidebar">
        <nav>
          <router-link to="/allocations">Allocations</router-link>
          <router-link to="/subgraphs">Subgraphs</router-link>
          <router-link to="/notifications">Notifications</router-link>
          <router-link to="/actions-manager">Actions Manager</router-link>
          <router-link to="/offchain-manager">Offchain Sync</router-link>
          <router-link to="/qos-dashboard">QoS</router-link>
          <router-link to="/query-dashboard">Query Fees</router-link>
          <router-link to="/settings">Settings</router-link>
          <router-link to="/status-dashboard">Status</router-link>
          <router-link to="/wizard">Wizard</router-link>
        </nav>
      </aside>
      <main class="app-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  height: 48px;
  background: var(--p-surface-800, #1e1e1e);
  color: var(--p-surface-0, #fff);
  border-bottom: 1px solid var(--p-surface-700, #333);
}

.app-title {
  font-weight: 600;
  font-size: 1.1rem;
}

.app-nav {
  display: flex;
  gap: 1rem;
}

.app-nav a {
  color: var(--p-surface-300, #ccc);
  text-decoration: none;
}

.app-nav a.router-link-active {
  color: var(--p-primary-color, #60a5fa);
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-sidebar {
  width: 200px;
  background: var(--p-surface-900, #141414);
  border-right: 1px solid var(--p-surface-700, #333);
  overflow-y: auto;
  padding: 0.5rem 0;
}

.app-sidebar nav {
  display: flex;
  flex-direction: column;
}

.app-sidebar a {
  padding: 0.5rem 1rem;
  color: var(--p-surface-300, #ccc);
  text-decoration: none;
  font-size: 0.875rem;
}

.app-sidebar a:hover {
  background: var(--p-surface-800, #1e1e1e);
}

.app-sidebar a.router-link-active {
  color: var(--p-primary-color, #60a5fa);
  background: var(--p-surface-800, #1e1e1e);
}

.app-main {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: var(--p-surface-950, #0a0a0a);
  color: var(--p-surface-0, #fff);
}
</style>
