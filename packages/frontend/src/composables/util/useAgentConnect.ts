import { ref, computed } from 'vue';
import { GraphQLClient } from 'graphql-request';

const STORAGE_KEY = 'indexer-tools-agent-url';

const agentUrl = ref(localStorage.getItem(STORAGE_KEY) ?? '');

export function useAgentConnect() {
  const isConnected = computed(() => !!agentUrl.value);

  const client = computed(() => {
    if (!agentUrl.value) return null;
    return new GraphQLClient(agentUrl.value);
  });

  function setAgentUrl(url: string) {
    agentUrl.value = url.trim();
    localStorage.setItem(STORAGE_KEY, agentUrl.value);
  }

  return { agentUrl, isConnected, client, setAgentUrl };
}
