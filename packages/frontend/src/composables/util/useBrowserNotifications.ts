import { ref, computed } from 'vue';
import type { SseIncidentEvent } from '../queries/useNotifications';

const permissionState = ref<NotificationPermission>(
  typeof Notification !== 'undefined' ? Notification.permission : 'denied',
);

export function useBrowserNotifications() {
  const isSupported = computed(() => typeof Notification !== 'undefined');

  async function requestPermission(): Promise<NotificationPermission> {
    if (!isSupported.value) return 'denied';
    const result = await Notification.requestPermission();
    permissionState.value = result;
    return result;
  }

  function showNotification(title: string, options: NotificationOptions = {}) {
    if (!isSupported.value || permissionState.value !== 'granted') return;
    const n = new Notification(title, {
      icon: '/favicon.ico',
      ...options,
    });
    setTimeout(() => n.close(), 10_000);
  }

  function handleIncidentEvent(event: SseIncidentEvent) {
    if (event.type !== 'incident:created') return;

    const severity = event.severity || 'info';
    const tag = `incident-${event.incidentId}`;

    showNotification(`New Incident: ${event.title}`, {
      body: `${severity.toUpperCase()} - ${event.targetLabel}`,
      tag,
    });
  }

  return {
    isSupported,
    permissionState,
    requestPermission,
    showNotification,
    handleIncidentEvent,
  };
}
