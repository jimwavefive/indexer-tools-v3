<template>
  <div class="accounts-manager">
    <div
      v-for="(account, idx) in settingsStore.state.accounts"
      :key="`${account.address}-${account.chain}`"
      class="account-card"
    >
      <div class="account-fields">
        <div class="field">
          <label>Indexer Name</label>
          <InputText v-model="account.name" class="full-width" />
        </div>
        <div class="field">
          <label>Indexer Address</label>
          <InputText v-model="account.address" class="full-width" />
        </div>
        <div class="field">
          <label>Chain</label>
          <Select
            v-model="account.chain"
            :options="chainOptions"
            option-label="label"
            option-value="value"
            class="full-width"
          />
        </div>
        <div class="field-row">
          <ToggleSwitch v-model="account.poiQuery" input-id="`poi-${idx}`" />
          <label :for="`poi-${idx}`">Enable POI Querying</label>
        </div>
        <div v-if="account.poiQuery" class="field">
          <label>POI Query Endpoint</label>
          <InputText v-model="account.poiQueryEndpoint" class="full-width" />
        </div>
      </div>
      <div class="account-actions">
        <Button
          v-if="!account.active"
          label="Set Active"
          severity="info"
          text
          size="small"
          @click="settingsStore.switchAccount(account.address, account.chain)"
        />
        <Tag v-else value="Active" severity="success" />
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          :disabled="settingsStore.state.accounts.length <= 1"
          @click="settingsStore.removeAccount(account.address, account.chain)"
        />
      </div>
    </div>

    <div class="add-account">
      <h4>Add Account</h4>
      <div class="field">
        <label>Address</label>
        <InputText v-model="newAddress" class="full-width" placeholder="0x..." />
      </div>
      <div class="field">
        <label>Name</label>
        <InputText v-model="newName" class="full-width" placeholder="my-indexer" />
      </div>
      <div class="field">
        <label>Chain</label>
        <Select
          v-model="newChain"
          :options="chainOptions"
          option-label="label"
          option-value="value"
          class="full-width"
        />
      </div>
      <Button
        label="Add Account"
        icon="pi pi-plus"
        :disabled="!newAddress.trim()"
        @click="handleAdd"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import Tag from 'primevue/tag';
import type { ChainId } from '@indexer-tools/shared';
import { CHAIN_CONFIGS } from '@indexer-tools/shared';
import { useSettingsStore } from '../../composables/state/useSettings';

const settingsStore = useSettingsStore();

const chainOptions = Object.keys(CHAIN_CONFIGS).map((id) => ({
  label: id,
  value: id,
}));

const newAddress = ref('');
const newName = ref('');
const newChain = ref<ChainId>('arbitrum-one');

function handleAdd() {
  if (!newAddress.value.trim()) return;
  settingsStore.addAccount({
    address: newAddress.value.trim(),
    name: newName.value.trim(),
    chain: newChain.value,
    poiQuery: false,
    poiQueryEndpoint: '',
  });
  newAddress.value = '';
  newName.value = '';
}
</script>

<style scoped>
.accounts-manager {
  max-width: 30rem;
}
.account-card {
  border: 1px solid var(--p-surface-300);
  border-radius: var(--p-border-radius);
  padding: 1rem;
  margin-bottom: 1rem;
}
.account-fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.field label {
  font-size: 0.85rem;
  font-weight: 500;
}
.field-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.account-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--p-surface-200);
}
.full-width {
  width: 100%;
}
.add-account {
  border: 1px dashed var(--p-surface-300);
  border-radius: var(--p-border-radius);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.add-account h4 {
  margin: 0;
}
</style>
