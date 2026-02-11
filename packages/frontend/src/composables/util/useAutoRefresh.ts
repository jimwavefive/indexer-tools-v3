import { watch, onUnmounted, ref } from 'vue';
import { useAppStore } from '../state/useApp';

export function useAutoRefresh(callback: () => void) {
  const appStore = useAppStore();
  const intervalId = ref<ReturnType<typeof setInterval> | null>(null);

  function clear() {
    if (intervalId.value !== null) {
      clearInterval(intervalId.value);
      intervalId.value = null;
    }
  }

  function setup(ms: number) {
    clear();
    if (ms > 0) {
      intervalId.value = setInterval(callback, ms);
    }
  }

  watch(
    () => appStore.autoRefreshInterval,
    (ms) => setup(ms),
    { immediate: true },
  );

  onUnmounted(clear);

  return { clear };
}
