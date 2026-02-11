<template>
  <div class="step-execute">
    <div class="command-section">
      <div class="section-header">
        <h3>Action Queue Commands</h3>
        <Button
          label="Copy"
          icon="pi pi-copy"
          severity="secondary"
          size="small"
          @click="copyToClipboard(actionsQueueCommands)"
        />
      </div>
      <Textarea
        :model-value="actionsQueueCommands"
        readonly
        auto-resize
        :rows="8"
        class="command-textarea"
      />
    </div>

    <div class="command-section">
      <div class="section-header">
        <h3>Indexing Rule Commands</h3>
        <Button
          label="Copy"
          icon="pi pi-copy"
          severity="secondary"
          size="small"
          @click="copyToClipboard(indexingRuleCommands)"
        />
      </div>
      <Textarea
        :model-value="indexingRuleCommands"
        readonly
        auto-resize
        :rows="8"
        class="command-textarea"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';

defineProps<{
  actionsQueueCommands: string;
  indexingRuleCommands: string;
}>();

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}
</script>

<style scoped>
.step-execute {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.command-section h3 {
  margin: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.command-textarea {
  width: 100%;
  font-family: monospace;
  font-size: 0.8rem;
}
</style>
