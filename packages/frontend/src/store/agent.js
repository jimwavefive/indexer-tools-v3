import { defineStore } from 'pinia'

const API_BASE = ''

export const useAgentStore = defineStore('agent', {
  state: () => ({
    conversations: [],
    activeConversationId: null,
    messages: [],
    loading: false,
    provider: 'claude',
    // Incident-specific state
    incidentConversations: {}, // Map of incidentId -> { conversationId, messages, pendingApproval }
    activeIncidentId: null,
    incidentChatOpen: false,
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

    // --- Incident Chat Actions ---

    openIncidentChat(incidentId) {
      this.activeIncidentId = incidentId
      this.incidentChatOpen = true

      // Initialize conversation state if not exists
      if (!this.incidentConversations[incidentId]) {
        this.incidentConversations[incidentId] = {
          conversationId: null,
          messages: [],
          pendingApproval: null,
          loading: false,
        }
      }

      // Fetch existing conversation if any
      this.fetchIncidentConversation(incidentId)
    },

    closeIncidentChat() {
      this.incidentChatOpen = false
    },

    async fetchIncidentConversation(incidentId) {
      if (!this.incidentConversations[incidentId]) {
        this.incidentConversations[incidentId] = {
          conversationId: null,
          messages: [],
          pendingApproval: null,
          loading: false,
        }
      }

      this.incidentConversations[incidentId].loading = true

      try {
        const res = await fetch(`${API_BASE}/api/agent/incident/${incidentId}/conversation`)
        const data = await res.json()

        this.incidentConversations[incidentId] = {
          conversationId: data.conversation?.id || null,
          messages: data.messages || [],
          pendingApproval: data.pendingApproval || null,
          loading: false,
        }
      } catch (err) {
        console.error('Failed to fetch incident conversation:', err)
        this.incidentConversations[incidentId].loading = false
      }
    },

    async sendIncidentMessage(incidentId, content) {
      if (!this.incidentConversations[incidentId]) {
        this.incidentConversations[incidentId] = {
          conversationId: null,
          messages: [],
          pendingApproval: null,
          loading: false,
        }
      }

      const conv = this.incidentConversations[incidentId]

      // Add user message optimistically
      conv.messages.push({
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      })

      conv.loading = true

      try {
        const res = await fetch(`${API_BASE}/api/agent/incident/${incidentId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content }),
        })

        const data = await res.json()

        if (data.error) {
          conv.messages.push({
            role: 'assistant',
            content: `Error: ${data.error}`,
            created_at: new Date().toISOString(),
            isError: true,
          })
        } else {
          conv.conversationId = data.conversationId
          conv.messages.push({
            role: 'assistant',
            content: data.response,
            created_at: new Date().toISOString(),
          })
          conv.pendingApproval = data.pendingApproval || null
        }
      } catch (err) {
        conv.messages.push({
          role: 'assistant',
          content: `Error: ${err.message || 'Failed to send message'}`,
          created_at: new Date().toISOString(),
          isError: true,
        })
      } finally {
        conv.loading = false
      }
    },

    async approveIncidentAction(incidentId, approvalId) {
      const conv = this.incidentConversations[incidentId]
      if (!conv) return

      conv.loading = true

      try {
        const res = await fetch(`${API_BASE}/api/agent/incident/${incidentId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId }),
        })

        const data = await res.json()

        if (data.error) {
          conv.messages.push({
            role: 'assistant',
            content: `Error approving action: ${data.error}`,
            created_at: new Date().toISOString(),
            isError: true,
          })
        } else {
          conv.messages.push({
            role: 'assistant',
            content: data.response,
            created_at: new Date().toISOString(),
          })
          conv.pendingApproval = null
        }
      } catch (err) {
        conv.messages.push({
          role: 'assistant',
          content: `Error: ${err.message || 'Failed to approve action'}`,
          created_at: new Date().toISOString(),
          isError: true,
        })
      } finally {
        conv.loading = false
      }
    },

    async rejectIncidentAction(incidentId, approvalId) {
      const conv = this.incidentConversations[incidentId]
      if (!conv) return

      conv.loading = true

      try {
        const res = await fetch(`${API_BASE}/api/agent/incident/${incidentId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId }),
        })

        const data = await res.json()

        if (data.rejected) {
          conv.pendingApproval = null
          conv.messages.push({
            role: 'system',
            content: 'Action rejected by user.',
            created_at: new Date().toISOString(),
          })
        }
      } catch (err) {
        console.error('Failed to reject action:', err)
      } finally {
        conv.loading = false
      }
    },

    getIncidentConversation(incidentId) {
      return this.incidentConversations[incidentId] || {
        conversationId: null,
        messages: [],
        pendingApproval: null,
        loading: false,
      }
    },
  },
})
