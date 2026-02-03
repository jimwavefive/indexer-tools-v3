<template>
  <v-container fluid class="pa-0" style="height: calc(100vh - 75px)">
    <v-row no-gutters style="height: 100%">
      <!-- Left sidebar: conversations -->
      <v-col cols="3" class="d-flex flex-column" style="border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); height: 100%">
        <div class="pa-3">
          <v-btn
            block
            color="primary"
            prepend-icon="mdi-plus"
            @click="agentStore.newConversation()"
          >
            New Chat
          </v-btn>
        </div>

        <v-list
          class="flex-grow-1 overflow-y-auto"
          density="compact"
          nav
        >
          <v-list-item
            v-for="conv in agentStore.conversationList"
            :key="conv.id"
            :active="conv.id === agentStore.activeConversationId"
            @click="agentStore.setConversation(conv.id)"
          >
            <v-list-item-title class="text-body-2 text-truncate">
              {{ conv.preview }}
            </v-list-item-title>

            <template #append>
              <v-btn
                icon
                size="x-small"
                variant="text"
                @click.stop="agentStore.deleteConversation(conv.id)"
              >
                <v-icon size="small">mdi-delete-outline</v-icon>
              </v-btn>
            </template>
          </v-list-item>

          <v-list-item v-if="agentStore.conversationList.length === 0" disabled>
            <v-list-item-title class="text-body-2 text-medium-emphasis">
              No conversations yet
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-col>

      <!-- Right main area -->
      <v-col cols="9" class="d-flex flex-column" style="height: 100%">
        <!-- Toolbar -->
        <v-toolbar density="compact" flat>
          <v-toolbar-title>AI Agent</v-toolbar-title>
          <v-chip
            size="small"
            color="primary"
            variant="tonal"
            class="mr-3"
          >
            <v-icon start size="small">mdi-robot</v-icon>
            {{ agentStore.provider }}
          </v-chip>
        </v-toolbar>

        <!-- Chat -->
        <agent-chat class="flex-grow-1" style="min-height: 0" />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useFeatureFlagStore } from '@/store/featureFlags'
import { useAgentStore } from '@/store/agent'
import AgentChat from '@/components/AgentChat.vue'

const router = useRouter()
const featureFlagStore = useFeatureFlagStore()
const agentStore = useAgentStore()

onMounted(() => {
  if (!featureFlagStore.isEnabled('agent')) {
    router.push('/')
    return
  }
  agentStore.fetchConversations()
})
</script>
