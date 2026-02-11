<template>
  <Dialog
    :visible="visible"
    @update:visible="$emit('update:visible', $event)"
    :header="editingChannel ? 'Edit Channel' : 'Create Channel'"
    modal
    :style="{ width: '28rem' }"
  >
    <div class="channel-form">
      <div class="field">
        <label>Name</label>
        <InputText v-model="form.name" placeholder="Channel name" class="full-width" />
      </div>

      <div class="field">
        <label>Webhook URL</label>
        <InputText
          v-model="form.webhookUrl"
          placeholder="https://discord.com/api/webhooks/..."
          class="full-width"
          type="password"
        />
      </div>

      <div class="field">
        <label>Enabled</label>
        <ToggleSwitch v-model="form.enabled" />
      </div>

      <div class="test-section">
        <Button
          label="Test Webhook"
          severity="secondary"
          size="small"
          icon="pi pi-send"
          :loading="testing"
          :disabled="!form.webhookUrl"
          @click="handleTest"
        />
        <span v-if="testResult" :class="['test-result', testResult.ok ? 'success' : 'error']">
          {{ testResult.message }}
        </span>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="$emit('update:visible', false)" />
      <Button
        :label="editingChannel ? 'Save' : 'Create'"
        @click="handleSubmit"
        :loading="submitting"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import Button from 'primevue/button';
import type { ChannelConfig } from '@indexer-tools/shared';

const props = defineProps<{
  visible: boolean;
  editingChannel: ChannelConfig | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [data: Partial<ChannelConfig> & { webhookUrl?: string }];
  test: [webhookUrl: string];
}>();

const submitting = ref(false);
const testing = ref(false);
const testResult = ref<{ ok: boolean; message: string } | null>(null);

const form = reactive({
  name: '',
  webhookUrl: '',
  enabled: true,
});

watch(
  () => props.visible,
  (open) => {
    if (!open) return;
    testResult.value = null;
    if (props.editingChannel) {
      form.name = props.editingChannel.name;
      form.webhookUrl = ''; // Don't populate masked URL
      form.enabled = props.editingChannel.enabled;
    } else {
      form.name = '';
      form.webhookUrl = '';
      form.enabled = true;
    }
  },
);

function handleSubmit() {
  submitting.value = true;
  const data: Partial<ChannelConfig> & { webhookUrl?: string } = {
    ...(props.editingChannel ? { id: props.editingChannel.id } : {}),
    name: form.name,
    type: 'discord',
    enabled: form.enabled,
  };
  // Only send webhook URL if provided (supports editing without changing webhook)
  if (form.webhookUrl) {
    data.config = { webhookUrl: form.webhookUrl };
  }
  emit('save', data);
}

function handleTest() {
  if (!form.webhookUrl) return;
  testing.value = true;
  testResult.value = null;
  emit('test', form.webhookUrl);
}

defineExpose({
  resetSubmitting: () => { submitting.value = false; },
  setTestResult: (ok: boolean, message: string) => {
    testing.value = false;
    testResult.value = { ok, message };
  },
});
</script>

<style scoped>
.channel-form {
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

.test-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.test-result {
  font-size: 0.8rem;
}

.test-result.success {
  color: var(--p-green-500);
}

.test-result.error {
  color: var(--p-red-500);
}
</style>
