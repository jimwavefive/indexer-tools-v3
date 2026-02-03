import { defineStore } from 'pinia';

const BASE_URL = '';

export const useNotificationRulesStore = defineStore('notificationRules', {
  state: () => ({
    rules: [],
    channels: [],
    history: [],
    loading: false,
  }),
  actions: {
    // --- Rules ---
    async fetchRules() {
      this.loading = true;
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/rules`);
        if (!res.ok) throw new Error(`Failed to fetch rules: ${res.statusText}`);
        this.rules = await res.json();
      } catch (err) {
        console.error('[notificationRules] fetchRules error:', err);
      } finally {
        this.loading = false;
      }
    },

    async createRule(rule) {
      this.loading = true;
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rule),
        });
        if (!res.ok) throw new Error(`Failed to create rule: ${res.statusText}`);
        const created = await res.json();
        this.rules.push(created);
        return created;
      } catch (err) {
        console.error('[notificationRules] createRule error:', err);
      } finally {
        this.loading = false;
      }
    },

    async updateRule(id, rule) {
      this.loading = true;
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/rules/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rule),
        });
        if (!res.ok) throw new Error(`Failed to update rule: ${res.statusText}`);
        const updated = await res.json();
        const idx = this.rules.findIndex((r) => r.id === id);
        if (idx !== -1) this.rules[idx] = updated;
        return updated;
      } catch (err) {
        console.error('[notificationRules] updateRule error:', err);
      } finally {
        this.loading = false;
      }
    },

    async deleteRule(id) {
      this.loading = true;
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/rules/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error(`Failed to delete rule: ${res.statusText}`);
        this.rules = this.rules.filter((r) => r.id !== id);
      } catch (err) {
        console.error('[notificationRules] deleteRule error:', err);
      } finally {
        this.loading = false;
      }
    },

    // --- Channels ---
    async fetchChannels() {
      this.loading = true;
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/channels`);
        if (!res.ok) throw new Error(`Failed to fetch channels: ${res.statusText}`);
        this.channels = await res.json();
      } catch (err) {
        console.error('[notificationRules] fetchChannels error:', err);
      } finally {
        this.loading = false;
      }
    },

    async createChannel(channel) {
      this.loading = true;
      try {
        const payload = {
          name: channel.name,
          type: 'discord',
          enabled: true,
          config: { webhookUrl: channel.webhookUrl },
        };
        const res = await fetch(`${BASE_URL}/api/notifications/channels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Failed to create channel: ${res.statusText}`);
        const created = await res.json();
        this.channels.push(created);
        return created;
      } catch (err) {
        console.error('[notificationRules] createChannel error:', err);
      } finally {
        this.loading = false;
      }
    },

    async updateChannel(id, channel) {
      this.loading = true;
      try {
        const payload = {
          name: channel.name,
          type: channel.type || 'discord',
          enabled: channel.enabled !== undefined ? channel.enabled : true,
          config: channel.webhookUrl ? { webhookUrl: channel.webhookUrl } : channel.config,
        };
        const res = await fetch(`${BASE_URL}/api/notifications/channels/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Failed to update channel: ${res.statusText}`);
        const updated = await res.json();
        const idx = this.channels.findIndex((c) => c.id === id);
        if (idx !== -1) this.channels[idx] = updated;
        return updated;
      } catch (err) {
        console.error('[notificationRules] updateChannel error:', err);
      } finally {
        this.loading = false;
      }
    },

    async deleteChannel(id) {
      this.loading = true;
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/channels/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error(`Failed to delete channel: ${res.statusText}`);
        this.channels = this.channels.filter((c) => c.id !== id);
      } catch (err) {
        console.error('[notificationRules] deleteChannel error:', err);
      } finally {
        this.loading = false;
      }
    },

    // --- History ---
    async fetchHistory() {
      this.loading = true;
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/history`);
        if (!res.ok) throw new Error(`Failed to fetch history: ${res.statusText}`);
        this.history = await res.json();
      } catch (err) {
        console.error('[notificationRules] fetchHistory error:', err);
      } finally {
        this.loading = false;
      }
    },

    async clearHistory() {
      this.loading = true;
      try {
        const res = await fetch(`${BASE_URL}/api/notifications/history`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error(`Failed to clear history: ${res.statusText}`);
        this.history = [];
      } catch (err) {
        console.error('[notificationRules] clearHistory error:', err);
      } finally {
        this.loading = false;
      }
    },
  },
});
