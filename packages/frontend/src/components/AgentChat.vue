<template>
  <div class="agent-chat d-flex flex-column" style="height: 100%">
    <!-- Messages area -->
    <div
      ref="messagesContainer"
      class="messages-area flex-grow-1 overflow-y-auto pa-4"
    >
      <!-- Suggested prompts when no messages -->
      <div
        v-if="agentStore.activeMessages.length === 0 && !agentStore.loading"
        class="d-flex flex-column align-center justify-center"
        style="height: 100%"
      >
        <v-icon size="64" color="primary" class="mb-4">mdi-robot</v-icon>
        <h2 class="text-h5 mb-2">Indexer AI Agent</h2>
        <p class="text-body-1 text-medium-emphasis mb-6">
          Ask about your allocations, APR, or get optimization suggestions.
        </p>
        <div class="d-flex flex-wrap justify-center ga-2">
          <v-chip
            v-for="prompt in suggestedPrompts"
            :key="prompt"
            variant="outlined"
            color="primary"
            size="large"
            class="ma-1"
            @click="sendSuggested(prompt)"
          >
            {{ prompt }}
          </v-chip>
        </div>
      </div>

      <!-- Message list -->
      <div v-else>
        <div
          v-for="msg in agentStore.activeMessages"
          :key="msg.id"
          class="mb-3"
        >
          <!-- User message -->
          <div v-if="msg.role === 'user'" class="d-flex justify-end">
            <v-card
              color="primary"
              class="pa-3"
              rounded="lg"
              max-width="75%"
            >
              <div class="text-body-1" style="white-space: pre-wrap">
                {{ msg.content }}
              </div>
            </v-card>
          </div>

          <!-- Tool result -->
          <div v-else-if="msg.role === 'tool'" class="d-flex justify-start">
            <v-expansion-panels variant="accordion" class="mb-1" style="max-width: 75%">
              <v-expansion-panel>
                <v-expansion-panel-title>
                  <v-icon size="small" class="mr-2">mdi-wrench</v-icon>
                  Tool: {{ msg.toolName }}
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <pre class="text-body-2" style="overflow-x: auto; white-space: pre-wrap">{{ msg.content }}</pre>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>

          <!-- Assistant message -->
          <div v-else class="d-flex justify-start">
            <v-card
              color="surface"
              variant="outlined"
              class="pa-3"
              rounded="lg"
              max-width="75%"
            >
              <div
                class="text-body-1 assistant-content"
                v-html="renderMarkdown(msg.content)"
              ></div>
              <v-chip
                v-if="msg.isError"
                color="error"
                size="x-small"
                class="mt-1"
              >
                Error
              </v-chip>
            </v-card>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading indicator -->
    <v-progress-linear
      v-if="agentStore.loading"
      indeterminate
      color="primary"
      height="3"
    />

    <!-- Input area -->
    <div class="pa-3" style="border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))">
      <v-text-field
        v-model="input"
        placeholder="Ask the AI agent..."
        variant="outlined"
        density="comfortable"
        hide-details
        :disabled="agentStore.loading"
        @keyup.enter="sendMessage"
      >
        <template #append-inner>
          <v-btn
            icon
            size="small"
            variant="text"
            :disabled="!input.trim() || agentStore.loading"
            @click="sendMessage"
          >
            <v-icon>mdi-send</v-icon>
          </v-btn>
        </template>
      </v-text-field>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useAgentStore } from '@/store/agent'

const agentStore = useAgentStore()
const input = ref('')
const messagesContainer = ref(null)

const suggestedPrompts = [
  'What are my current allocations?',
  'Analyze my APR across all subgraphs',
  'When do my allocations expire?',
  'Suggest allocation rebalancing',
]

function renderMarkdown(text) {
  if (!text) return ''
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Line breaks
  html = html.replace(/\n/g, '<br>')
  return html
}

function sendMessage() {
  const trimmed = input.value.trim()
  if (!trimmed || agentStore.loading) return
  agentStore.sendMessage(trimmed)
  input.value = ''
}

function sendSuggested(prompt) {
  agentStore.sendMessage(prompt)
}

// Auto-scroll to bottom on new messages
watch(
  () => agentStore.activeMessages.length,
  async () => {
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  },
)
</script>

<style scoped>
.messages-area {
  min-height: 0;
}

.assistant-content :deep(pre) {
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
}

.assistant-content :deep(code) {
  font-family: monospace;
  font-size: 0.9em;
}
</style>
