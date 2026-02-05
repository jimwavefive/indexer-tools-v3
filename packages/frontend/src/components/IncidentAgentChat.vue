<template>
  <v-card
    v-if="agentStore.incidentChatOpen"
    class="incident-chat-container"
    elevation="12"
  >
    <!-- Header -->
    <v-card-title class="d-flex align-center py-2 px-3" style="background: #5a3c57; color: white">
      <v-icon start size="small">mdi-robot</v-icon>
      <span class="text-body-2 font-weight-bold">AI Autofix</span>
      <v-spacer></v-spacer>
      <v-btn icon size="x-small" variant="text" color="white" @click="minimize">
        <v-icon>mdi-minus</v-icon>
      </v-btn>
      <v-btn icon size="x-small" variant="text" color="white" @click="close">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </v-card-title>

    <!-- Messages -->
    <v-card-text ref="messagesContainer" class="messages-container pa-2">
      <div v-if="conversation.messages.length === 0" class="text-center text-medium-emphasis py-4">
        <v-icon size="large" class="mb-2">mdi-chat-processing-outline</v-icon>
        <div class="text-body-2">Ask the AI to investigate and fix this incident.</div>
        <div class="text-caption">Try: "Investigate this issue" or "Can you fix this?"</div>
      </div>

      <div
        v-for="(msg, idx) in conversation.messages"
        :key="idx"
        class="message-bubble mb-2"
        :class="{
          'user-message': msg.role === 'user',
          'assistant-message': msg.role === 'assistant',
          'system-message': msg.role === 'system',
          'error-message': msg.isError,
        }"
      >
        <div class="message-role text-caption font-weight-bold mb-1">
          {{ msg.role === 'user' ? 'You' : msg.role === 'system' ? 'System' : 'AI' }}
        </div>
        <div class="message-content text-body-2" v-html="formatMessage(msg.content)"></div>
      </div>

      <div v-if="conversation.loading" class="d-flex justify-center py-2">
        <v-progress-circular indeterminate size="20" width="2" color="primary"></v-progress-circular>
        <span class="ml-2 text-caption">Thinking...</span>
      </div>
    </v-card-text>

    <!-- Approval Actions -->
    <div v-if="conversation.pendingApproval" class="approval-actions pa-2">
      <v-alert type="warning" variant="tonal" density="compact" class="mb-2">
        <div class="text-body-2 font-weight-bold">Action requires approval</div>
        <div class="text-caption">{{ conversation.pendingApproval.action_type }}</div>
      </v-alert>
      <div class="d-flex gap-2">
        <v-btn
          color="success"
          size="small"
          :loading="conversation.loading"
          @click="approve"
        >
          <v-icon start>mdi-check</v-icon>
          Approve
        </v-btn>
        <v-btn
          color="error"
          size="small"
          variant="outlined"
          :loading="conversation.loading"
          @click="reject"
        >
          <v-icon start>mdi-close</v-icon>
          Reject
        </v-btn>
      </div>
    </div>

    <!-- Input -->
    <v-card-actions class="pa-2">
      <v-text-field
        v-model="inputMessage"
        placeholder="Ask the AI..."
        density="compact"
        hide-details
        variant="outlined"
        class="flex-grow-1"
        @keydown.enter.prevent="send"
        :disabled="conversation.loading || !!conversation.pendingApproval"
      ></v-text-field>
      <v-btn
        icon
        size="small"
        color="primary"
        class="ml-2"
        :disabled="!inputMessage.trim() || conversation.loading || !!conversation.pendingApproval"
        @click="send"
      >
        <v-icon>mdi-send</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>

  <!-- Minimized button -->
  <v-btn
    v-else-if="minimized"
    class="incident-chat-minimized"
    color="primary"
    icon
    @click="restore"
  >
    <v-icon>mdi-robot</v-icon>
    <v-tooltip activator="parent" location="left">AI Autofix</v-tooltip>
  </v-btn>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useAgentStore } from '@/store/agent'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const agentStore = useAgentStore()

const inputMessage = ref('')
const minimized = ref(false)
const messagesContainer = ref(null)

const conversation = computed(() => {
  if (!agentStore.activeIncidentId) {
    return { conversationId: null, messages: [], pendingApproval: null, loading: false }
  }
  return agentStore.getIncidentConversation(agentStore.activeIncidentId)
})

function formatMessage(content) {
  if (!content) return ''
  const html = marked.parse(content, { breaks: true, gfm: true })
  return DOMPurify.sanitize(html)
}

function send() {
  const message = inputMessage.value.trim()
  if (!message || !agentStore.activeIncidentId) return

  agentStore.sendIncidentMessage(agentStore.activeIncidentId, message)
  inputMessage.value = ''
}

function approve() {
  if (!agentStore.activeIncidentId || !conversation.value.pendingApproval) return
  agentStore.approveIncidentAction(
    agentStore.activeIncidentId,
    conversation.value.pendingApproval.id
  )
}

function reject() {
  if (!agentStore.activeIncidentId || !conversation.value.pendingApproval) return
  agentStore.rejectIncidentAction(
    agentStore.activeIncidentId,
    conversation.value.pendingApproval.id
  )
}

function minimize() {
  agentStore.closeIncidentChat()
  minimized.value = true
}

function restore() {
  minimized.value = false
  agentStore.incidentChatOpen = true
}

function close() {
  agentStore.closeIncidentChat()
  minimized.value = false
}

// Auto-scroll to bottom when new messages arrive
watch(
  () => conversation.value.messages.length,
  async () => {
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  }
)
</script>

<style scoped>
.incident-chat-container {
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 400px;
  max-width: calc(100vw - 32px);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  max-height: 500px;
}

.incident-chat-minimized {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2000;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  max-height: 300px;
  min-height: 150px;
}

.message-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  max-width: 90%;
}

.user-message {
  background: #e3f2fd;
  margin-left: auto;
}

.assistant-message {
  background: #f5f5f5;
}

.system-message {
  background: #fff3e0;
  font-style: italic;
}

.error-message {
  background: #ffebee;
}

.message-role {
  color: #666;
}

.message-content :deep(p) {
  margin-bottom: 0.5rem;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message-content :deep(code) {
  background: #e8e8e8;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 0.85em;
}

.message-content :deep(pre) {
  background: #2d2d2d;
  color: #f8f8f2;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.8em;
}

.approval-actions {
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
}
</style>
