import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const useAppStore = defineStore('app', () => {
  const theme = ref<'dark' | 'light'>(
    (localStorage.getItem('theme') as 'dark' | 'light') || 'dark',
  );
  const autoRefreshInterval = ref<number>(
    parseInt(localStorage.getItem('autoRefreshInterval') || '300000', 10),
  );
  const sidebarOpen = ref(false);

  // Apply dark mode class on theme change
  function applyTheme() {
    if (theme.value === 'dark') {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }

  // Apply on store init
  applyTheme();

  watch(theme, () => {
    applyTheme();
    localStorage.setItem('theme', theme.value);
  });

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  function setAutoRefreshInterval(interval: number) {
    autoRefreshInterval.value = interval;
    localStorage.setItem('autoRefreshInterval', String(interval));
  }

  return {
    theme,
    autoRefreshInterval,
    sidebarOpen,
    toggleTheme,
    setAutoRefreshInterval,
  };
});
