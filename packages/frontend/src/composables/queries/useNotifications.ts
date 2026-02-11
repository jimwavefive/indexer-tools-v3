import { ref, computed, onUnmounted, type Ref } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type {
  RuleConfig,
  ChannelConfig,
  IncidentRecord,
  HistoryRecord,
} from '@indexer-tools/shared';

// ---------- API helper ----------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------- Rules ----------

export function useRules() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', 'rules'] as const,
    queryFn: () => apiFetch<RuleConfig[]>('/api/notifications/rules'),
    staleTime: 60_000,
  });

  const createRule = useMutation({
    mutationFn: (rule: Partial<RuleConfig>) =>
      apiFetch<RuleConfig>('/api/notifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] }),
  });

  const updateRule = useMutation({
    mutationFn: ({ id, ...data }: Partial<RuleConfig> & { id: string }) =>
      apiFetch<RuleConfig>(`/api/notifications/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] }),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/notifications/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'rules'] }),
  });

  const testRule = useMutation({
    mutationFn: (id: string) =>
      apiFetch<Record<string, unknown>>(`/api/notifications/rules/${id}/test`, {
        method: 'POST',
      }),
  });

  return {
    rules: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    createRule,
    updateRule,
    deleteRule,
    testRule,
  };
}

// ---------- Channels ----------

export function useChannels() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', 'channels'] as const,
    queryFn: () => apiFetch<ChannelConfig[]>('/api/notifications/channels'),
    staleTime: 60_000,
  });

  const createChannel = useMutation({
    mutationFn: (channel: Partial<ChannelConfig>) =>
      apiFetch<ChannelConfig>('/api/notifications/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] }),
  });

  const updateChannel = useMutation({
    mutationFn: ({ id, ...data }: Partial<ChannelConfig> & { id: string }) =>
      apiFetch<ChannelConfig>(`/api/notifications/channels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] }),
  });

  const deleteChannel = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/notifications/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] }),
  });

  const testChannel = useMutation({
    mutationFn: (webhookUrl: string) =>
      apiFetch<{ success: boolean }>('/api/notifications/channels/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
      }),
  });

  return {
    channels: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    createChannel,
    updateChannel,
    deleteChannel,
    testChannel,
  };
}

// ---------- History ----------

export function useNotificationHistory() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', 'history'] as const,
    queryFn: () => apiFetch<HistoryRecord[]>('/api/notifications/history'),
    staleTime: 60_000,
  });

  const clearHistory = useMutation({
    mutationFn: () => apiFetch<void>('/api/notifications/history', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'history'] }),
  });

  return {
    history: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    clearHistory,
  };
}

// ---------- Incidents ----------

export function useIncidents(statusFilter: Ref<string>) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: computed(() => ['notifications', 'incidents', statusFilter.value] as const),
    queryFn: () =>
      apiFetch<IncidentRecord[]>(
        `/api/notifications/incidents?status=${statusFilter.value}`,
      ),
    staleTime: 30_000,
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) =>
      apiFetch<IncidentRecord>(
        `/api/notifications/incidents/${id}/acknowledge`,
        { method: 'PUT' },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications', 'incidents'] }),
  });

  const resolve = useMutation({
    mutationFn: (id: string) =>
      apiFetch<IncidentRecord>(
        `/api/notifications/incidents/${id}/resolve`,
        { method: 'PUT' },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications', 'incidents'] }),
  });

  async function fetchFixCommands(id: string) {
    return apiFetch<{ type: string; script: string; deployments?: unknown[] }>(
      `/api/notifications/incidents/${id}/fix-commands`,
    );
  }

  return {
    incidents: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    acknowledge,
    resolve,
    fetchFixCommands,
  };
}

// ---------- Notification Settings ----------

export function useNotificationSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', 'settings'] as const,
    queryFn: () =>
      apiFetch<{ pollingIntervalMinutes: number }>('/api/notifications/settings'),
    staleTime: 120_000,
  });

  const updateSettings = useMutation({
    mutationFn: (settings: { pollingIntervalMinutes: number }) =>
      apiFetch<{ pollingIntervalMinutes: number }>('/api/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['notifications', 'settings'] }),
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    updateSettings,
  };
}

// ---------- SSE ----------

export interface SseIncidentEvent {
  type: string;
  incidentId: string;
  ruleId: string;
  status: string;
  severity: string;
  targetLabel: string;
  title: string;
  timestamp: string;
}

export function useIncidentSSE() {
  const queryClient = useQueryClient();
  const sseConnected = ref(false);
  const lastEvent = ref<SseIncidentEvent | null>(null);

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function handleEvent(event: SseIncidentEvent) {
    const { type, incidentId } = event;

    if (type === 'incident:created') {
      apiFetch<IncidentRecord>(`/api/notifications/incidents/${incidentId}`)
        .then((incident) => {
          for (const status of ['open', 'acknowledged', 'all']) {
            queryClient.setQueryData<IncidentRecord[]>(
              ['notifications', 'incidents', status],
              (old) =>
                old
                  ? [incident, ...old.filter((i) => i.id !== incidentId)]
                  : [incident],
            );
          }
        })
        .catch(() => {});
    } else if (type === 'incident:updated' || type === 'incident:acknowledged') {
      apiFetch<IncidentRecord>(`/api/notifications/incidents/${incidentId}`)
        .then((incident) => {
          for (const status of ['open', 'acknowledged', 'all']) {
            queryClient.setQueryData<IncidentRecord[]>(
              ['notifications', 'incidents', status],
              (old) => old?.map((i) => (i.id === incidentId ? incident : i)),
            );
          }
        })
        .catch(() => {});
    } else if (
      type === 'incident:resolved' ||
      type === 'incident:auto-resolved'
    ) {
      for (const status of ['open', 'acknowledged', 'all']) {
        queryClient.setQueryData<IncidentRecord[]>(
          ['notifications', 'incidents', status],
          (old) =>
            old?.map((i) =>
              i.id === incidentId
                ? { ...i, status: 'resolved' as const, resolved_at: event.timestamp }
                : i,
            ),
        );
      }
    }

    lastEvent.value = event;
  }

  function connect() {
    if (eventSource) return;

    const es = new EventSource('/api/notifications/incidents/stream');

    es.addEventListener('connected', () => {
      sseConnected.value = true;
    });

    es.addEventListener('incident', (e) => {
      try {
        handleEvent(JSON.parse(e.data));
      } catch (err) {
        console.error('[SSE] Parse error:', err);
      }
    });

    es.onerror = () => {
      sseConnected.value = false;
      es.close();
      eventSource = null;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 5000);
    };

    eventSource = es;
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    sseConnected.value = false;
  }

  onUnmounted(disconnect);

  return { sseConnected, lastEvent, connect, disconnect };
}
