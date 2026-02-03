import { defineStore } from 'pinia';

const STORAGE_KEY = 'featureFlags';

const FLAG_DEFINITIONS = {
  notifications: {
    label: 'Notifications',
    description: 'On-chain event monitoring and Discord notifications',
    envVar: 'VITE_FEATURE_NOTIFICATIONS',
    default: false,
  },
  agent: {
    label: 'AI Agent',
    description: 'AI-powered allocation management chat interface',
    envVar: 'VITE_FEATURE_AGENT',
    default: false,
  },
  autoTargetApr: {
    label: 'Auto Target APR',
    description: 'Automatic target APR calculation in allocation wizard',
    envVar: 'VITE_FEATURE_AUTO_TARGET_APR',
    default: true,
  },
  experimentalUI: {
    label: 'Experimental UI',
    description: 'Experimental UI features and components',
    envVar: 'VITE_FEATURE_EXPERIMENTAL_UI',
    default: false,
  },
};

function getEnvDefault(envVar, fallback) {
  const val = import.meta.env[envVar];
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return fallback;
}

function loadPersistedFlags() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export const useFeatureFlagStore = defineStore('featureFlags', {
  state: () => {
    const persisted = loadPersistedFlags();
    const flags = {};
    for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
      flags[key] = persisted[key] !== undefined
        ? persisted[key]
        : getEnvDefault(def.envVar, def.default);
    }
    return { flags };
  },
  getters: {
    isEnabled: (state) => (flag) => !!state.flags[flag],
    getDefinitions: () => FLAG_DEFINITIONS,
    allFlags: (state) => {
      return Object.entries(FLAG_DEFINITIONS).map(([key, def]) => ({
        key,
        ...def,
        enabled: !!state.flags[key],
      }));
    },
  },
  actions: {
    toggle(flag) {
      if (flag in this.flags) {
        this.flags[flag] = !this.flags[flag];
        this.persist();
      }
    },
    setFlag(flag, value) {
      if (flag in this.flags) {
        this.flags[flag] = !!value;
        this.persist();
      }
    },
    resetToDefaults() {
      for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
        this.flags[key] = getEnvDefault(def.envVar, def.default);
      }
      localStorage.removeItem(STORAGE_KEY);
    },
    persist() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.flags));
    },
  },
});
