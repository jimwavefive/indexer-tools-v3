import { defineStore } from 'pinia'

export const useNotificationStore = defineStore('notifications', {
  state: () => ({
    notifications: [],
    nextId: 0,
  }),
  actions: {
    add(message, type = 'info', timeout = 6000) {
      const id = this.nextId++;
      this.notifications.push({ id, message, type, visible: true });
      if (timeout > 0) {
        setTimeout(() => this.dismiss(id), timeout);
      }
    },
    dismiss(id) {
      const notification = this.notifications.find(n => n.id === id);
      if (notification) {
        notification.visible = false;
      }
      this.notifications = this.notifications.filter(n => n.visible);
    },
    error(message) {
      this.add(message, 'error', 10000);
    },
    success(message) {
      this.add(message, 'success', 4000);
    },
    warning(message) {
      this.add(message, 'warning', 6000);
    },
    info(message) {
      this.add(message, 'info', 6000);
    },
  },
})
