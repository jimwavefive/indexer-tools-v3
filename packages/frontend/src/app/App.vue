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

/* Dark mode baseline */
html.dark-mode {
  color-scheme: dark;
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
