<template>
  <Toast />
  <router-view />
</template>

<script setup lang="ts">
import Toast from 'primevue/toast';
</script>

<style>
/* Global styles */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Dark-mode-aware custom properties (Zinc palette) */
:root {
  --app-table-bg: #ffffff;
  --app-table-header-bg: #fafafa;
  --app-table-row-hover: #f4f4f5;
  --app-surface-elevated: #f4f4f5;
  --app-surface-border: #e4e4e7;
  --app-surface-border-strong: #d4d4d8;
  --app-badge-bg: #e4e4e7;
  --app-badge-text: #27272a;
}
html.dark-mode {
  color-scheme: dark;
  --app-table-bg: #09090b;
  --app-table-header-bg: #18181b;
  --app-table-row-hover: #1c1c1e;
  --app-surface-elevated: #18181b;
  --app-surface-border: #27272a;
  --app-surface-border-strong: #3f3f46;
  --app-badge-bg: #3f3f46;
  --app-badge-text: #e4e4e7;
}
html.dark-mode body {
  background: #0a0a0a;
  color: #e5e5e5;
}
body {
  background: #fafafa;
  color: #1a1a1a;
}
</style>
