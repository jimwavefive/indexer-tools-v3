<template>
  <div class="rpc-settings">
    <h3>Custom RPC Endpoints</h3>
    <p class="hint">
      Use your own RPCs if the defaults are rate-limited or you want the automatic indexing rewards feature.
    </p>

    <div v-for="chain in rpcChains" :key="chain.id" class="rpc-row">
      <div class="rpc-header">
        <ToggleSwitch
          :model-value="!!chainStore.rpcOverrides[chain.id]"
          @update:model-value="(v: boolean) => toggleRpc(chain.id, v)"
          :input-id="`rpc-${chain.id}`"
        />
        <label :for="`rpc-${chain.id}`" class="chain-label">{{ chain.label }}</label>
      </div>
      <InputText
        v-if="chainStore.rpcOverrides[chain.id] !== undefined"
        :model-value="chainStore.rpcOverrides[chain.id] || ''"
        @update:model-value="(v: string) => chainStore.setRpcOverride(chain.id, v)"
        :placeholder="chain.placeholder"
        class="full-width"
      />
    </div>

    <h3 style="margin-top: 2rem">Chain Validation RPCs</h3>
    <p class="hint">
      Set custom RPC endpoints for chain validation instead of using the default DRPC provider.
      Use your own nodes (e.g. via eRPC) for reliable block hash verification.
    </p>

    <div v-for="chain in validationChains" :key="chain.id" class="rpc-row">
      <div class="rpc-header">
        <ToggleSwitch
          :model-value="!!settingsStore.state.chainValidationRpcs[chain.id]"
          @update:model-value="(v: boolean) => toggleValidationRpc(chain.id, v)"
          :input-id="`val-${chain.id}`"
        />
        <label :for="`val-${chain.id}`" class="chain-label">{{ chain.label }}</label>
      </div>
      <InputText
        v-if="settingsStore.state.chainValidationRpcs[chain.id] !== undefined"
        v-model="settingsStore.state.chainValidationRpcs[chain.id]"
        :placeholder="chain.placeholder"
        class="full-width"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import type { ChainId } from '@indexer-tools/shared';
import { useChainStore } from '../../composables/state/useChain';
import { useSettingsStore } from '../../composables/state/useSettings';

const chainStore = useChainStore();
const settingsStore = useSettingsStore();

const rpcChains: { id: ChainId; label: string; placeholder: string }[] = [
  { id: 'mainnet', label: 'Ethereum Mainnet', placeholder: 'https://eth.example.com' },
  { id: 'arbitrum-one', label: 'Arbitrum One', placeholder: 'https://arb.example.com' },
  { id: 'sepolia', label: 'Sepolia', placeholder: 'https://sepolia.example.com' },
  { id: 'arbitrum-sepolia', label: 'Arbitrum Sepolia', placeholder: 'https://arb-sepolia.example.com' },
];

const validationChains = [
  { id: 'mainnet', label: 'Ethereum Mainnet', placeholder: 'https://ethereum.erpc.example.com:8555' },
  { id: 'arbitrum-one', label: 'Arbitrum One', placeholder: 'https://arbitrum.erpc.example.com:8555' },
  { id: 'matic', label: 'Polygon', placeholder: 'https://polygon.erpc.example.com:8555' },
  { id: 'gnosis', label: 'Gnosis', placeholder: 'https://gnosis.erpc.example.com:8555' },
  { id: 'base', label: 'Base', placeholder: 'https://base.erpc.example.com:8555' },
  { id: 'sepolia', label: 'Sepolia', placeholder: 'https://sepolia.erpc.example.com:8555' },
  { id: 'arbitrum-sepolia', label: 'Arbitrum Sepolia', placeholder: 'https://arb-sepolia.erpc.example.com:8555' },
];

function toggleRpc(chainId: ChainId, enabled: boolean) {
  if (enabled) {
    chainStore.setRpcOverride(chainId, '');
  } else {
    chainStore.clearRpcOverride(chainId);
  }
}

function toggleValidationRpc(chainId: string, enabled: boolean) {
  if (enabled) {
    settingsStore.state.chainValidationRpcs[chainId] = '';
  } else {
    delete settingsStore.state.chainValidationRpcs[chainId];
  }
}
</script>

<style scoped>
.rpc-settings {
  max-width: 40rem;
}
.hint {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
  margin-bottom: 1rem;
}
.rpc-row {
  margin-bottom: 1rem;
}
.rpc-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}
.chain-label {
  font-weight: 500;
}
.full-width {
  width: 100%;
}
</style>
