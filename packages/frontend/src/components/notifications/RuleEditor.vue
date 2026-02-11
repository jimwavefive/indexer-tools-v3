<template>
  <Dialog
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    :header="editingRule ? 'Edit Rule' : 'Create Rule'"
    modal
    :style="{ width: '32rem' }"
  >
    <div class="rule-form">
      <div class="field">
        <label>Name</label>
        <InputText v-model="form.name" placeholder="Rule name" class="full-width" />
      </div>

      <div class="field">
        <label>Type</label>
        <Select
          v-model="form.type"
          :options="RULE_TYPES"
          option-label="label"
          option-value="value"
          placeholder="Select type"
          class="full-width"
          :disabled="!!editingRule"
        />
      </div>

      <div class="field">
        <label>Enabled</label>
        <ToggleSwitch v-model="form.enabled" />
      </div>

      <!-- Type-specific conditions -->
      <template v-if="form.type === 'allocation_duration'">
        <div class="field">
          <label>Duration (hours)</label>
          <InputNumber v-model="form.conditions.hours" :min="1" class="full-width" />
        </div>
      </template>

      <template v-else-if="form.type === 'signal_drop'">
        <div class="field">
          <label>Drop percentage (%)</label>
          <InputNumber v-model="form.conditions.percentage" :min="1" :max="100" class="full-width" />
        </div>
      </template>

      <template v-else-if="form.type === 'proportion'">
        <div class="field">
          <label>Min proportion</label>
          <InputNumber v-model="form.conditions.minProportion" :min="0" :max="1" :maxFractionDigits="4" class="full-width" />
        </div>
      </template>

      <template v-else-if="form.type === 'subgraph_upgrade'">
        <div class="field">
          <label>Min GRT allocated</label>
          <InputNumber v-model="form.conditions.minGrt" :min="0" class="full-width" />
        </div>
        <div class="field">
          <label>Max APR (%, 0 = disabled)</label>
          <InputNumber v-model="form.conditions.maxApr" :min="0" :max="100" class="full-width" />
        </div>
      </template>

      <template v-else-if="form.type === 'behind_chainhead_allocated' || form.type === 'behind_chainhead'">
        <div class="field">
          <label>Behind blocks threshold</label>
          <InputNumber v-model="form.conditions.behindBlocks" :min="1" class="full-width" />
        </div>
      </template>

      <!-- failed_subgraph_allocated and negative_stake have no conditions -->

      <div class="field">
        <label>Polling Interval (minutes, leave blank for global default)</label>
        <InputNumber v-model="form.pollingIntervalMinutes" :min="1" :max="120" class="full-width" />
      </div>

      <div class="field">
        <label>Channels</label>
        <MultiSelect
          v-model="form.channelIds"
          :options="channels"
          option-label="name"
          option-value="id"
          placeholder="Select channels"
          class="full-width"
        />
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="$emit('update:visible', false)" />
      <Button
        :label="editingRule ? 'Save' : 'Create'"
        @click="handleSubmit"
        :loading="submitting"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, watch, ref } from 'vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import MultiSelect from 'primevue/multiselect';
import Button from 'primevue/button';
import type { RuleConfig, ChannelConfig } from '@indexer-tools/shared';

const RULE_TYPES = [
  { label: 'Allocation Duration', value: 'allocation_duration' },
  { label: 'Signal Drop', value: 'signal_drop' },
  { label: 'Proportion', value: 'proportion' },
  { label: 'Subgraph Upgrade', value: 'subgraph_upgrade' },
  { label: 'Failed Subgraph', value: 'failed_subgraph_allocated' },
  { label: 'Behind Chainhead', value: 'behind_chainhead_allocated' },
  { label: 'Negative Stake', value: 'negative_stake' },
];

const props = defineProps<{
  visible: boolean;
  editingRule: RuleConfig | null;
  channels: ChannelConfig[];
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [data: Partial<RuleConfig>];
}>();

const submitting = ref(false);

const form = reactive<{
  name: string;
  type: string;
  enabled: boolean;
  conditions: Record<string, unknown>;
  pollingIntervalMinutes: number | null;
  channelIds: string[];
}>({
  name: '',
  type: '',
  enabled: true,
  conditions: {},
  pollingIntervalMinutes: null,
  channelIds: [],
});

// Reset form when dialog opens or editing rule changes
watch(
  () => props.visible,
  (open) => {
    if (!open) return;
    if (props.editingRule) {
      form.name = props.editingRule.name;
      form.type = props.editingRule.type;
      form.enabled = props.editingRule.enabled;
      form.conditions = { ...props.editingRule.conditions };
      form.pollingIntervalMinutes = props.editingRule.pollingIntervalMinutes ?? null;
      form.channelIds = [...(props.editingRule.channelIds ?? [])];
    } else {
      form.name = '';
      form.type = '';
      form.enabled = true;
      form.conditions = {};
      form.pollingIntervalMinutes = null;
      form.channelIds = [];
    }
  },
);

function handleSubmit() {
  submitting.value = true;
  emit('save', {
    ...(props.editingRule ? { id: props.editingRule.id } : {}),
    name: form.name,
    type: form.type,
    enabled: form.enabled,
    conditions: { ...form.conditions },
    pollingIntervalMinutes: form.pollingIntervalMinutes,
    channelIds: form.channelIds,
  });
  // Parent will close dialog on success
}

defineExpose({ resetSubmitting: () => { submitting.value = false; } });
</script>

<style scoped>
.rule-form {
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
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.full-width {
  width: 100%;
}
</style>
