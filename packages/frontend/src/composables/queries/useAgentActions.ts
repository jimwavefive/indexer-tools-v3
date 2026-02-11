import { ref, computed } from 'vue';
import { useSettingsStore } from '../state/useSettings';
import { useChainStore } from '../state/useChain';
import { useSnackbar } from '../state/useSnackbar';

export interface AgentAction {
  id: string;
  status: string;
  type: string;
  deploymentID: string;
  allocationID: string;
  amount: string;
  poi: string;
  publicPOI: string;
  poiBlockNumber: string;
  force: boolean;
  priority: number;
  source: string;
  reason: string;
  transaction: string;
  failureReason: string;
  protocolNetwork: string;
}

export const ACTION_FIELDS = `
  id status type deploymentID allocationID amount poi publicPOI
  poiBlockNumber force priority source reason transaction failureReason
  protocolNetwork
`;

export interface ActionInput {
  type: 'allocate' | 'unallocate' | 'reallocate';
  deploymentID: string;
  allocationID?: string;
  amount?: string;
  poi?: string;
  force?: boolean;
  status: string;
  source: string;
  reason: string;
  priority: number;
  protocolNetwork: string;
  isLegacy: boolean;
}

export function useAgentActions() {
  const settingsStore = useSettingsStore();
  const chainStore = useChainStore();
  const snackbar = useSnackbar();

  const activeAccount = computed(() => settingsStore.getActiveAccount());
  const agentEndpoint = computed(() => activeAccount.value?.agentEndpoint ?? '');
  const isConnected = computed(
    () => !!activeAccount.value?.agentConnect && !!activeAccount.value?.agentEndpoint,
  );

  const actions = ref<AgentAction[]>([]);
  const loading = ref(false);
  const errors = ref<string[]>([]);

  // Raw fetch to avoid graphql-request's strict response validation
  // (indexer-agent can return non-standard error formats)
  async function agentRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const url = agentEndpoint.value;
    if (!url) throw new Error('No agent endpoint');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(json.errors.map((e: any) => e.message).join(', '));
    }
    return json.data as T;
  }

  function disconnectAgent() {
    const acc = activeAccount.value;
    if (acc) acc.agentConnect = false;
    actions.value = [];
  }

  function updateActions(updated: AgentAction[]) {
    const map = new Map(updated.map((a) => [a.id, a]));
    actions.value = actions.value.map((a) => map.get(a.id) ?? a);
  }

  async function fetchActions() {
    if (!isConnected.value) return;
    loading.value = true;
    try {
      const data = await agentRequest<{ actions: AgentAction[] }>(
        `query actions($filter: ActionFilter!) { actions(filter: $filter) { ${ACTION_FIELDS} } }`,
        { filter: {} },
      );
      actions.value = data.actions;
    } catch (err) {
      errors.value.push(String(err));
      snackbar.error('Failed to fetch actions');
    } finally {
      loading.value = false;
    }
  }

  async function approveActions(actionIDs: string[]) {
    if (!isConnected.value || actionIDs.length === 0) return;
    try {
      const data = await agentRequest<{ approveActions: AgentAction[] }>(
        `mutation approveActions($actionIDs: [String!]!) { approveActions(actionIDs: $actionIDs) { ${ACTION_FIELDS} } }`,
        { actionIDs },
      );
      updateActions(data.approveActions);
      snackbar.success(`Approved ${data.approveActions.length} actions`);
    } catch (err) {
      errors.value.push(String(err));
      snackbar.error('Failed to approve actions');
    }
  }

  async function cancelActions(actionIDs: string[]) {
    if (!isConnected.value || actionIDs.length === 0) return;
    try {
      const data = await agentRequest<{ cancelActions: AgentAction[] }>(
        `mutation cancelActions($actionIDs: [String!]!) { cancelActions(actionIDs: $actionIDs) { ${ACTION_FIELDS} } }`,
        { actionIDs },
      );
      updateActions(data.cancelActions);
      snackbar.success(`Cancelled ${data.cancelActions.length} actions`);
    } catch (err) {
      errors.value.push(String(err));
      snackbar.error('Failed to cancel actions');
    }
  }

  async function deleteActions(actionIDs: string[]) {
    if (!isConnected.value || actionIDs.length === 0) return;
    try {
      await agentRequest(
        `mutation deleteActions($actionIDs: [String!]!) { deleteActions(actionIDs: $actionIDs) { ${ACTION_FIELDS} } }`,
        { actionIDs },
      );
      actions.value = actions.value.filter((a) => !actionIDs.includes(a.id));
      snackbar.success(`Deleted ${actionIDs.length} actions`);
    } catch (err) {
      errors.value.push(String(err));
      snackbar.error('Failed to delete actions');
    }
  }

  async function executeApproved() {
    if (!isConnected.value) return;
    try {
      const data = await agentRequest<{ executeApprovedActions: AgentAction[] }>(
        `mutation executeApprovedActions { executeApprovedActions { ${ACTION_FIELDS} } }`,
      );
      updateActions(data.executeApprovedActions);
      snackbar.success(`Executed ${data.executeApprovedActions.length} actions`);
    } catch (err) {
      errors.value.push(String(err));
      snackbar.error('Failed to execute approved actions');
    }
  }

  async function queueActions(inputs: ActionInput[]): Promise<AgentAction[]> {
    if (!isConnected.value || inputs.length === 0) return [];
    loading.value = true;
    try {
      const data = await agentRequest<{ queueActions: AgentAction[] }>(
        `mutation queueActions($actions: [ActionInput!]!) { queueActions(actions: $actions) { ${ACTION_FIELDS} } }`,
        { actions: inputs },
      );
      actions.value.push(...data.queueActions);
      snackbar.success(`Queued ${data.queueActions.length} actions`);
      return data.queueActions;
    } catch (err) {
      errors.value.push(String(err));
      snackbar.error('Failed to queue actions');
      return [];
    } finally {
      loading.value = false;
    }
  }

  async function addToOffchainSync(ipfsHashes: string[]): Promise<number> {
    if (!isConnected.value || ipfsHashes.length === 0) return 0;
    let added = 0;
    for (const hash of ipfsHashes) {
      try {
        await agentRequest(
          `mutation setIndexingRule($rule: IndexingRuleInput!) {
            setIndexingRule(rule: $rule) { identifier decisionBasis }
          }`,
          {
            rule: {
              identifier: hash,
              identifierType: 'deployment',
              decisionBasis: 'offchain',
              protocolNetwork: chainStore.activeChainId,
            },
          },
        );
        added++;
      } catch (err) {
        errors.value.push(`Failed to sync ${hash.slice(0, 7)}...: ${err}`);
      }
    }
    if (added > 0) {
      snackbar.success(`Added ${added} deployment${added !== 1 ? 's' : ''} to offchain sync`);
    }
    return added;
  }

  return {
    actions,
    loading,
    errors,
    isConnected,
    agentEndpoint,
    fetchActions,
    approveActions,
    cancelActions,
    deleteActions,
    executeApproved,
    queueActions,
    addToOffchainSync,
    disconnectAgent,
  };
}
