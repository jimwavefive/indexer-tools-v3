// Utilities
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    theme: localStorage.getItem('theme') || 'dark',
    autoRefreshInterval: 0,
  }),
  actions: {
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', this.theme);
    },
    setAutoRefreshInterval(interval) {
      this.autoRefreshInterval = interval;
      localStorage.setItem('autoRefreshInterval', interval);
    },
  },
})
