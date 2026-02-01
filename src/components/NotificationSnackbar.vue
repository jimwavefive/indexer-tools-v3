<template>
  <div>
    <v-snackbar
      v-for="notification in notificationStore.notifications"
      :key="notification.id"
      :model-value="notification.visible"
      :color="colorMap[notification.type]"
      :timeout="-1"
      location="top"
      style="margin-top: 80px"
    >
      {{ notification.message }}
      <template v-slot:actions>
        <v-btn
          variant="text"
          @click="notificationStore.dismiss(notification.id)"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup>
import { useNotificationStore } from '@/store/notifications';

const notificationStore = useNotificationStore();

const colorMap = {
  error: 'error',
  success: 'success',
  warning: 'warning',
  info: 'info',
};
</script>
