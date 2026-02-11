import { watch } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { useSettingsStore } from '../state/useSettings';

export interface BlacklistEntry {
  ipfsHash: string;
  addedAt: string;
  source: string;
}

async function fetchBlacklist(): Promise<BlacklistEntry[]> {
  const res = await fetch('/api/blacklist');
  if (!res.ok) throw new Error('Failed to fetch blacklist');
  const data = await res.json();
  return data.entries;
}

async function addEntry(ipfsHash: string): Promise<void> {
  const res = await fetch('/api/blacklist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ipfsHash }),
  });
  if (!res.ok) throw new Error('Failed to add blacklist entry');
}

async function removeEntry(ipfsHash: string): Promise<void> {
  const res = await fetch(`/api/blacklist/${encodeURIComponent(ipfsHash)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove blacklist entry');
}

export function useBlacklist() {
  const queryClient = useQueryClient();
  const settingsStore = useSettingsStore();

  const query = useQuery({
    queryKey: ['blacklist'],
    queryFn: fetchBlacklist,
    staleTime: 60_000,
  });

  // Sync backend entries into settings store for getCombinedBlacklist()
  watch(query.data, (entries) => {
    settingsStore.setBackendBlacklist(entries ? entries.map((e) => e.ipfsHash) : []);
  }, { immediate: true });

  const addMutation = useMutation({
    mutationFn: addEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blacklist'] }),
  });

  const removeMutation = useMutation({
    mutationFn: removeEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blacklist'] }),
  });

  return {
    entries: query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
    addEntry: addMutation,
    removeEntry: removeMutation,
  };
}
