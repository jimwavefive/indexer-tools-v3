import { defineStore } from 'pinia'

const API_BASE = ''

export const useAgentStore = defineStore('agent', {
  state: () => ({
    conversations: [],
    activeConversationId: null,
    messages: [],
    loading: false,
    provider: 'claude',
  }),
  getters: {
    activeMessages(state) {
      if (!state.activeConversationId) return state.messages
      return state.messages.filter(
        (m) => m.conversationId === state.activeConversationId,
      )
    },
    conversationList(state) {
      return state.conversations.map((c) => ({
        id: c.id,
        preview: c.lastMessage
          ? c.lastMessage.substring(0, 80)
          : 'New conversation',
        updatedAt: c.updatedAt || c.createdAt,
      }))
    },
  },
  actions: {
    async sendMessage(content) {
      const userMessage = {
        id: Date.now(),
        role: 'user',
        content,
        conversationId: this.activeConversationId,
        timestamp: new Date().toISOString(),
      }
      this.messages.push(userMessage)
      this.loading = true

      try {
        const res = await fetch(`${API_BASE}/api/agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content,
            conversationId: this.activeConversationId,
          }),
        })
        const data = await res.json()

        if (!this.activeConversationId && data.conversationId) {
          this.activeConversationId = data.conversationId
        }

        // Append tool results if present
        if (data.toolResults && data.toolResults.length > 0) {
          for (const tool of data.toolResults) {
            this.messages.push({
              id: Date.now() + Math.random(),
              role: 'tool',
              toolName: tool.name,
              content: JSON.stringify(tool.result, null, 2),
              conversationId: this.activeConversationId,
              timestamp: new Date().toISOString(),
            })
          }
        }

        // Append assistant response
        const assistantMessage = {
          id: data.messageId || Date.now() + 1,
          role: 'assistant',
          content: data.response || data.message || '',
          conversationId: this.activeConversationId,
          timestamp: new Date().toISOString(),
        }
        this.messages.push(assistantMessage)

        // Refresh conversations list
        this.fetchConversations()
      } catch (err) {
        this.messages.push({
          id: Date.now() + 2,
          role: 'assistant',
          content: `Error: ${err.message || 'Failed to get response from agent'}`,
          conversationId: this.activeConversationId,
          timestamp: new Date().toISOString(),
          isError: true,
        })
      } finally {
        this.loading = false
      }
    },

    async fetchConversations() {
      try {
        const res = await fetch(`${API_BASE}/api/agent/conversations`)
        const data = await res.json()
        this.conversations = data.conversations || data || []
      } catch (err) {
        console.error('Failed to fetch conversations:', err)
      }
    },

    async deleteConversation(id) {
      try {
        await fetch(`${API_BASE}/api/agent/conversations/${id}`, {
          method: 'DELETE',
        })
        this.conversations = this.conversations.filter((c) => c.id !== id)
        if (this.activeConversationId === id) {
          this.activeConversationId = null
          this.messages = []
        }
      } catch (err) {
        console.error('Failed to delete conversation:', err)
      }
    },

    newConversation() {
      this.activeConversationId = null
      this.messages = []
    },

    async setConversation(id) {
      this.activeConversationId = id
      this.loading = true
      try {
        const res = await fetch(
          `${API_BASE}/api/agent/conversations/${id}/messages`,
        )
        const data = await res.json()
        this.messages = data.messages || data || []
      } catch (err) {
        console.error('Failed to fetch messages:', err)
        this.messages = []
      } finally {
        this.loading = false
      }
    },
  },
})
