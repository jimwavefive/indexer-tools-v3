import { ref, computed } from 'vue';
import { GraphQLClient } from 'graphql-request';
import { useSettingsStore } from '../state/useSettings';
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
}

export function useAgentActions() {
  const settingsStore = useSettingsStore();
  const snackbar = useSnackbar();

  const activeAccount = computed(() => settingsStore.getActiveAccount());
  const agentEndpoint = computed(() => activeAccount.value?.agentEndpoint ?? '');
  const isConnected = computed(
    () => !!activeAccount.value?.agentConnect && !!activeAccount.value?.agentEndpoint,
  );

  const client = computed(() => {
    if (!isConnected.value || !agentEndpoint.value) return null;
    return new GraphQLClient(agentEndpoint.value);
  });

  const actions = ref<AgentAction[]>([]);
  const loading = ref(false);
  const errors = ref<string[]>([]);

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
    const c = client.value;
    if (!c) return;
    loading.value = true;
    try {
      const data = await c.request<{ actions: AgentAction[] }>(
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
    const c = client.value;
    if (!c || actionIDs.length === 0) return;
    try {
      const data = await c.request<{ approveActions: AgentAction[] }>(
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
    const c = client.value;
    if (!c || actionIDs.length === 0) return;
    try {
      const data = await c.request<{ cancelActions: AgentAction[] }>(
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
    const c = client.value;
    if (!c || actionIDs.length === 0) return;
    try {
      await c.request(
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
    const c = client.value;
    if (!c) return;
    try {
      const data = await c.request<{ executeApprovedActions: AgentAction[] }>(
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
    const c = client.value;
    if (!c || inputs.length === 0) return [];
    loading.value = true;
    try {
      const data = await c.request<{ queueActions: AgentAction[] }>(
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

  return {
    actions,
    loading,
    errors,
    isConnected,
    agentEndpoint,
    client,
    fetchActions,
    approveActions,
    cancelActions,
    deleteActions,
    executeApproved,
    queueActions,
    disconnectAgent,
  };
}
