import { defineStore } from 'pinia';
import { reactive, watch } from 'vue';
import type { ChainId } from '@indexer-tools/shared';
import { useRuntimeConfig, type Account } from '../../plugins/defaults';

// Column visibility/ordering for TanStack Table
export interface ColumnSetting {
  id: string;
  title: string;
  visible: boolean;
}

export interface SortSetting {
  id: string;
  desc: boolean;
}

// Default column configurations — IDs correspond to TanStack Table column IDs
const DEFAULT_SUBGRAPH_COLUMNS: ColumnSetting[] = [
  { id: 'status', title: 'Status', visible: true },
  { id: 'name', title: 'Name', visible: true },
  { id: 'network', title: 'Network', visible: true },
  { id: 'createdAt', title: 'Created', visible: true },
  { id: 'apr', title: 'Current APR', visible: true },
  { id: 'newApr', title: 'New APR', visible: true },
  { id: 'maxAllo', title: 'Max Allocation', visible: false },
  { id: 'dailyRewards', title: 'Est Daily Rewards', visible: false },
  { id: 'dailyRewardsCut', title: 'Est Daily Rewards (After Cut)', visible: false },
  { id: 'signalledTokens', title: 'Current Signal', visible: true },
  { id: 'proportion', title: 'Current Proportion', visible: true },
  { id: 'stakedTokens', title: 'Current Allocations', visible: false },
  { id: 'queryFees', title: 'Query Fees (1d)', visible: false },
  { id: 'queryCount', title: 'Queries (1d)', visible: false },
  { id: 'deploymentId', title: 'Deployment ID', visible: false },
];

const DEFAULT_ALLOCATION_COLUMNS: ColumnSetting[] = [
  { id: 'status', title: 'Status', visible: true },
  { id: 'statusChecks', title: 'Health', visible: true },
  { id: 'name', title: 'Name', visible: true },
  { id: 'allocatedTokens', title: 'Allocated', visible: true },
  { id: 'network', title: 'Network', visible: true },
  { id: 'createdAt', title: 'Created', visible: false },
  { id: 'activeDuration', title: 'Duration', visible: true },
  { id: 'apr', title: 'Current APR', visible: true },
  { id: 'dailyRewards', title: 'Est Daily Rewards', visible: false },
  { id: 'dailyRewardsCut', title: 'Est Daily Rewards (After Cut)', visible: false },
  { id: 'pendingRewards', title: 'Pending Rewards', visible: false },
  { id: 'pendingRewardsCut', title: 'Pending Rewards (After Cut)', visible: false },
  { id: 'signalledTokens', title: 'Current Signal', visible: true },
  { id: 'proportion', title: 'Current Proportion', visible: true },
  { id: 'stakedTokens', title: 'Current Allocations', visible: false },
  { id: 'deploymentId', title: 'Deployment ID', visible: false },
  { id: 'allocationId', title: 'Allocation ID', visible: false },
  { id: 'qosQueryFees', title: 'Query Fees (1d)', visible: false },
  { id: 'qosQueryCount', title: 'Query Count (1d)', visible: false },
  { id: 'qosAvgLatency', title: 'Avg Latency', visible: false },
  { id: 'qosSuccessRate', title: 'Success Rate', visible: false },
];

interface SettingsState {
  // Subgraph filters
  search: string;
  minSignal: string;
  maxSignal: string;
  newAllocation: string;
  targetApr: string;
  noRewardsFilter: number;
  networkFilter: string[];
  statusFilter: string;
  hideCurrentlyAllocated: boolean;
  hideZeroApr: boolean;
  automaticIndexingRewards: boolean;

  // Blacklist / Synclist
  activateBlacklist: boolean;
  activateSynclist: boolean;
  subgraphBlacklist: string;
  subgraphSynclist: string;

  // Column visibility & ordering
  subgraphColumns: ColumnSetting[];
  allocationColumns: ColumnSetting[];

  // Table sort
  subgraphSort: SortSetting[];
  allocationSort: SortSetting[];

  // Accounts
  accounts: Account[];

  // Limit GQL subgraph queries to chains with active allocations
  limitToIndexerChains: boolean;

  // Chain validation RPCs (per-chain, separate from main RPC overrides)
  chainValidationRpcs: Record<string, string>;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const runtimeConfig = useRuntimeConfig();

  const state = reactive<SettingsState>({
    // Subgraph filters
    search: '',
    minSignal: '',
    maxSignal: '',
    newAllocation: '100000',
    targetApr: '10',
    noRewardsFilter: 0,
    networkFilter: [],
    statusFilter: 'none',
    hideCurrentlyAllocated: true,
    hideZeroApr: false,
    automaticIndexingRewards: false,

    // Blacklist / Synclist
    activateBlacklist: true,
    activateSynclist: false,
    subgraphBlacklist: '',
    subgraphSynclist: '',

    // Column settings
    subgraphColumns: DEFAULT_SUBGRAPH_COLUMNS.map((c) => ({ ...c })),
    allocationColumns: DEFAULT_ALLOCATION_COLUMNS.map((c) => ({ ...c })),

    // Sort settings
    subgraphSort: [{ id: 'newApr', desc: true }],
    allocationSort: [{ id: 'apr', desc: false }],

    // Accounts — from runtime config or localStorage
    accounts: [],

    // Limit to indexer's chains
    limitToIndexerChains: true,

    // Chain validation RPCs
    chainValidationRpcs: {},
  });

  // Load persisted state from localStorage (overrides defaults)
  const persisted = loadFromStorage<Partial<SettingsState>>('settings', {});
  if (persisted && typeof persisted === 'object') {
    Object.assign(state, persisted);
  }

  // If no accounts from localStorage, use runtime config defaults
  if (!state.accounts.length && runtimeConfig.accounts.length) {
    state.accounts = runtimeConfig.accounts.map((a) => ({ ...a }));
  }

  // If no chain validation RPCs from localStorage, use runtime config
  if (
    !Object.keys(state.chainValidationRpcs).length &&
    Object.keys(runtimeConfig.chainValidationRpcs).length
  ) {
    state.chainValidationRpcs = { ...runtimeConfig.chainValidationRpcs };
  }

  // File-loaded blacklist (from blacklist.txt)
  const fileBlacklist = runtimeConfig.blacklist;

  // Persist to localStorage on any change
  watch(
    () => ({ ...state }),
    () => {
      localStorage.setItem('settings', JSON.stringify(state));
    },
    { deep: true },
  );

  // Backend blacklist entries (populated by BlacklistManager / useBlacklist)
  let backendBlacklist: string[] = [];

  function setBackendBlacklist(entries: string[]) {
    backendBlacklist = entries;
  }

  // Computed: combined blacklist (file + manual + backend)
  function getCombinedBlacklist(): string[] {
    const manual = state.subgraphBlacklist
      ? state.subgraphBlacklist
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
      : [];
    return [...new Set([...fileBlacklist, ...manual, ...backendBlacklist])];
  }

  // Active account
  function getActiveAccount(): Account | undefined {
    return state.accounts.find((a) => a.active);
  }

  function switchAccount(address: string, chain: ChainId) {
    const target = state.accounts.find(
      (a) => a.address === address.toLowerCase() && a.chain === chain,
    );
    const current = getActiveAccount();
    if (target && target !== current) {
      if (current) current.active = false;
      target.active = true;
    }
  }

  function addAccount(account: Omit<Account, 'active'>) {
    const existing = state.accounts.find(
      (a) => a.address === account.address.toLowerCase() && a.chain === account.chain,
    );
    if (!existing) {
      state.accounts.push({
        ...account,
        address: account.address.toLowerCase(),
        active: false,
      });
      switchAccount(account.address, account.chain);
    }
  }

  function removeAccount(address: string, chain: ChainId) {
    const idx = state.accounts.findIndex(
      (a) => a.address === address.toLowerCase() && a.chain === chain,
    );
    if (idx === -1) return;

    const wasActive = state.accounts[idx].active;
    state.accounts.splice(idx, 1);

    // If we removed the active account, activate another
    if (wasActive && state.accounts.length > 0) {
      state.accounts[0].active = true;
    }
  }

  // Column management
  function resetSubgraphColumns() {
    state.subgraphColumns = DEFAULT_SUBGRAPH_COLUMNS.map((c) => ({ ...c }));
  }

  function resetAllocationColumns() {
    state.allocationColumns = DEFAULT_ALLOCATION_COLUMNS.map((c) => ({ ...c }));
  }

  function moveColumn(
    type: 'subgraphColumns' | 'allocationColumns',
    from: number,
    to: number,
  ) {
    const arr = state[type];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
  }

  function toggleColumnVisibility(
    type: 'subgraphColumns' | 'allocationColumns',
    columnId: string,
  ) {
    const col = state[type].find((c) => c.id === columnId);
    if (col) col.visible = !col.visible;
  }

  return {
    state,
    fileBlacklist,
    setBackendBlacklist,
    getCombinedBlacklist,
    getActiveAccount,
    switchAccount,
    addAccount,
    removeAccount,
    resetSubgraphColumns,
    resetAllocationColumns,
    moveColumn,
    toggleColumnVisibility,
  };
});
