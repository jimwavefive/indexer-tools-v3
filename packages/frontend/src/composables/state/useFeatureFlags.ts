import { defineStore } from 'pinia';
import { reactive } from 'vue';

const STORAGE_KEY = 'featureFlags';

export interface FlagDefinition {
  label: string;
  description: string;
  envVar: string;
  default: boolean;
}

const FLAG_DEFINITIONS: Record<string, FlagDefinition> = {
  notifications: {
    label: 'Notifications',
    description: 'On-chain event monitoring and Discord notifications',
    envVar: 'VITE_FEATURE_NOTIFICATIONS',
    default: false,
  },
  autoTargetApr: {
    label: 'Auto Target APR',
    description: 'Automatic target APR calculation in allocation wizard',
    envVar: 'VITE_FEATURE_AUTO_TARGET_APR',
    default: true,
  },
  browserNotifications: {
    label: 'Browser Notifications',
    description: 'Desktop notifications for new incidents via Web Notifications API',
    envVar: 'VITE_FEATURE_BROWSER_NOTIFICATIONS',
    default: false,
  },
};

function getEnvDefault(envVar: string, fallback: boolean): boolean {
  const val = import.meta.env[envVar];
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return fallback;
}

function loadPersistedFlags(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export const useFeatureFlagStore = defineStore('featureFlags', () => {
  const persisted = loadPersistedFlags();
  const flags = reactive<Record<string, boolean>>({});

  for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
    flags[key] =
      persisted[key] !== undefined
        ? persisted[key]
        : getEnvDefault(def.envVar, def.default);
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  }

  function isEnabled(flag: string): boolean {
    return !!flags[flag];
  }

  function toggle(flag: string) {
    if (flag in flags) {
      flags[flag] = !flags[flag];
      persist();
    }
  }

  function setFlag(flag: string, value: boolean) {
    if (flag in flags) {
      flags[flag] = !!value;
      persist();
    }
  }

  function resetToDefaults() {
    for (const [key, def] of Object.entries(FLAG_DEFINITIONS)) {
      flags[key] = getEnvDefault(def.envVar, def.default);
    }
    localStorage.removeItem(STORAGE_KEY);
  }

  function allFlags() {
    return Object.entries(FLAG_DEFINITIONS).map(([key, def]) => ({
      key,
      ...def,
      enabled: !!flags[key],
    }));
  }

  return {
    flags,
    isEnabled,
    toggle,
    setFlag,
    resetToDefaults,
    allFlags,
    definitions: FLAG_DEFINITIONS,
  };
});
