<template>
  <div>
    <v-card>
      <v-toolbar flat color="#5a3c57" dark>
        <v-toolbar-title>Notification Settings</v-toolbar-title>
      </v-toolbar>

      <v-tabs v-model="tab" class="mb-2">
        <v-tab value="rules">
          <v-icon start>mdi-format-list-bulleted</v-icon>
          Rules
        </v-tab>
        <v-tab value="channels">
          <v-icon start>mdi-webhook</v-icon>
          Channels
        </v-tab>
        <v-tab value="history">
          <v-icon start>mdi-history</v-icon>
          History
        </v-tab>
      </v-tabs>

      <v-window v-model="tab">
        <!-- ========== RULES TAB ========== -->
        <v-window-item value="rules">
          <v-card flat>
            <v-card-text>
              <div class="d-flex justify-end mb-4">
                <v-btn color="primary" @click="openRuleDialog()">
                  <v-icon start>mdi-plus</v-icon>
                  Add Rule
                </v-btn>
              </div>

              <v-data-table
                :headers="ruleHeaders"
                :items="store.rules"
                :loading="store.loading"
                items-per-page="25"
              >
                <template #item.enabled="{ item }">
                  <v-switch
                    :model-value="item.enabled"
                    hide-details
                    density="compact"
                    @update:model-value="(v) => toggleRuleEnabled(item, v)"
                  ></v-switch>
                </template>
                <template #item.actions="{ item }">
                  <v-btn icon size="small" variant="text" @click="openRuleDialog(item)">
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn icon size="small" variant="text" color="error" @click="confirmDeleteRule(item)">
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </template>
              </v-data-table>
            </v-card-text>
          </v-card>
        </v-window-item>

        <!-- ========== CHANNELS TAB ========== -->
        <v-window-item value="channels">
          <v-card flat>
            <v-card-text>
              <div class="d-flex justify-end mb-4">
                <v-btn color="primary" @click="openChannelDialog()">
                  <v-icon start>mdi-plus</v-icon>
                  Add Channel
                </v-btn>
              </div>

              <v-data-table
                :headers="channelHeaders"
                :items="store.channels"
                :loading="store.loading"
                items-per-page="25"
              >
                <template #item.enabled="{ item }">
                  <v-switch
                    :model-value="item.enabled"
                    hide-details
                    density="compact"
                    @update:model-value="(v) => toggleChannelEnabled(item, v)"
                  ></v-switch>
                </template>
                <template #item.webhookUrl="{ item }">
                  <span :title="item.config?.webhookUrl">
                    {{ item.config?.webhookUrl ? item.config.webhookUrl.substring(0, 40) + '...' : '' }}
                  </span>
                </template>
                <template #item.actions="{ item }">
                  <v-btn icon size="small" variant="text" @click="openChannelDialog(item)">
                    <v-icon>mdi-pencil</v-icon>
                  </v-btn>
                  <v-btn icon size="small" variant="text" color="error" @click="confirmDeleteChannel(item)">
                    <v-icon>mdi-delete</v-icon>
                  </v-btn>
                </template>
              </v-data-table>
            </v-card-text>
          </v-card>
        </v-window-item>

        <!-- ========== HISTORY TAB ========== -->
        <v-window-item value="history">
          <v-card flat>
            <v-card-text>
              <div class="d-flex justify-end mb-4">
                <v-btn color="error" variant="outlined" @click="confirmClearHistory">
                  <v-icon start>mdi-delete-sweep</v-icon>
                  Clear History
                </v-btn>
              </div>

              <v-data-table
                :headers="historyHeaders"
                :items="store.history"
                :loading="store.loading"
                items-per-page="25"
                sort-by="timestamp"
              >
                <template #item.timestamp="{ item }">
                  {{ new Date(item.timestamp).toLocaleString() }}
                </template>
                <template #item.notification.severity="{ item }">
                  <v-chip
                    :color="severityColor(item.notification?.severity)"
                    size="small"
                    label
                  >
                    {{ item.notification?.severity }}
                  </v-chip>
                </template>
              </v-data-table>
            </v-card-text>
          </v-card>
        </v-window-item>
      </v-window>
    </v-card>

    <!-- ========== RULE DIALOG ========== -->
    <v-dialog v-model="ruleDialogOpen" max-width="600" persistent>
      <v-card>
        <v-card-title>{{ editingRule ? 'Edit Rule' : 'Add Rule' }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="ruleForm.name"
            label="Name"
            class="mb-2"
          ></v-text-field>
          <v-select
            v-model="ruleForm.type"
            :items="ruleTypes"
            label="Type"
            class="mb-2"
          ></v-select>
          <v-switch
            v-model="ruleForm.enabled"
            label="Enabled"
            class="mb-2"
          ></v-switch>

          <!-- Condition fields based on type -->
          <div v-if="ruleForm.type === 'allocation_duration'" class="mb-2">
            <v-text-field
              v-model.number="ruleForm.conditions.thresholdEpochs"
              label="Threshold Epochs"
              type="number"
            ></v-text-field>
          </div>
          <div v-if="ruleForm.type === 'proportion'" class="mb-2">
            <v-text-field
              v-model.number="ruleForm.conditions.threshold"
              label="Threshold"
              type="number"
            ></v-text-field>
          </div>

          <v-select
            v-model="ruleForm.channels"
            :items="store.channels"
            item-title="name"
            item-value="id"
            label="Channels"
            multiple
            chips
            class="mb-2"
          ></v-select>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="ruleDialogOpen = false">Cancel</v-btn>
          <v-btn color="primary" @click="saveRule" :loading="store.loading">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ========== CHANNEL DIALOG ========== -->
    <v-dialog v-model="channelDialogOpen" max-width="600" persistent>
      <v-card>
        <v-card-title>{{ editingChannel ? 'Edit Channel' : 'Add Channel' }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="channelForm.name"
            label="Name"
            class="mb-2"
          ></v-text-field>
          <v-text-field
            v-model="channelForm.webhookUrl"
            label="Webhook URL"
            class="mb-2"
          ></v-text-field>
          <v-btn
            variant="outlined"
            size="small"
            @click="testChannel"
            :loading="testingChannel"
            class="mb-2"
          >
            <v-icon start>mdi-send</v-icon>
            Test
          </v-btn>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="channelDialogOpen = false">Cancel</v-btn>
          <v-btn color="primary" @click="saveChannel" :loading="store.loading">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ========== DELETE CONFIRM DIALOG ========== -->
    <v-dialog v-model="deleteDialogOpen" max-width="400">
      <v-card>
        <v-card-title>Confirm Delete</v-card-title>
        <v-card-text>{{ deleteMessage }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="deleteDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" @click="executeDelete" :loading="store.loading">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- ========== CLEAR HISTORY CONFIRM ========== -->
    <v-dialog v-model="clearHistoryDialogOpen" max-width="400">
      <v-card>
        <v-card-title>Confirm Clear History</v-card-title>
        <v-card-text>Are you sure you want to clear all notification history?</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="clearHistoryDialogOpen = false">Cancel</v-btn>
          <v-btn color="error" @click="executeClearHistory" :loading="store.loading">Clear</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationRulesStore } from '@/store/notificationRules';
import { useFeatureFlagStore } from '@/store/featureFlags';

const router = useRouter();
const store = useNotificationRulesStore();
const featureFlagStore = useFeatureFlagStore();

// Guard: redirect if notifications feature flag is not enabled
if (!featureFlagStore.isEnabled('notifications')) {
  router.replace('/');
}

const tab = ref('rules');

// --- Table Headers ---
const ruleHeaders = [
  { title: 'Name', key: 'name' },
  { title: 'Type', key: 'type' },
  { title: 'Enabled', key: 'enabled', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false },
];

const channelHeaders = [
  { title: 'Name', key: 'name' },
  { title: 'Type', key: 'type' },
  { title: 'Enabled', key: 'enabled', sortable: false },
  { title: 'Webhook URL', key: 'webhookUrl', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false },
];

const historyHeaders = [
  { title: 'Timestamp', key: 'timestamp' },
  { title: 'Rule', key: 'notification.ruleId' },
  { title: 'Message', key: 'notification.title' },
  { title: 'Severity', key: 'notification.severity' },
];

const ruleTypes = [
  { title: 'Allocation Duration', value: 'allocation_duration' },
  { title: 'Signal Drop', value: 'signal_drop' },
  { title: 'Proportion', value: 'proportion' },
  { title: 'Subgraph Upgrade', value: 'subgraph_upgrade' },
];

// --- Rule Dialog ---
const ruleDialogOpen = ref(false);
const editingRule = ref(null);
const ruleForm = ref(defaultRuleForm());

function defaultRuleForm() {
  return {
    name: '',
    type: 'allocation_duration',
    enabled: true,
    conditions: {},
    channels: [],
  };
}

function openRuleDialog(rule) {
  if (rule) {
    editingRule.value = rule;
    ruleForm.value = {
      name: rule.name,
      type: rule.type,
      enabled: rule.enabled,
      conditions: { ...(rule.conditions || {}) },
      channels: rule.channels ? [...rule.channels] : [],
    };
  } else {
    editingRule.value = null;
    ruleForm.value = defaultRuleForm();
  }
  ruleDialogOpen.value = true;
}

async function saveRule() {
  if (editingRule.value) {
    await store.updateRule(editingRule.value.id, ruleForm.value);
  } else {
    await store.createRule(ruleForm.value);
  }
  ruleDialogOpen.value = false;
}

async function toggleRuleEnabled(rule, enabled) {
  await store.updateRule(rule.id, { ...rule, enabled });
}

// --- Channel Dialog ---
const channelDialogOpen = ref(false);
const editingChannel = ref(null);
const channelForm = ref(defaultChannelForm());
const testingChannel = ref(false);

function defaultChannelForm() {
  return {
    name: '',
    webhookUrl: '',
  };
}

function openChannelDialog(channel) {
  if (channel) {
    editingChannel.value = channel;
    channelForm.value = {
      name: channel.name,
      webhookUrl: channel.config?.webhookUrl || '',
    };
  } else {
    editingChannel.value = null;
    channelForm.value = defaultChannelForm();
  }
  channelDialogOpen.value = true;
}

async function saveChannel() {
  if (editingChannel.value) {
    await store.updateChannel(editingChannel.value.id, channelForm.value);
  } else {
    await store.createChannel(channelForm.value);
  }
  channelDialogOpen.value = false;
}

async function toggleChannelEnabled(channel, enabled) {
  await store.updateChannel(channel.id, { ...channel, enabled });
}

async function testChannel() {
  testingChannel.value = true;
  try {
    await fetch('/api/notifications/channels/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: channelForm.value.webhookUrl }),
    });
  } catch (err) {
    console.error('[NotificationSettings] test channel error:', err);
  } finally {
    testingChannel.value = false;
  }
}

// --- Delete ---
const deleteDialogOpen = ref(false);
const deleteMessage = ref('');
let pendingDelete = null;

function confirmDeleteRule(rule) {
  deleteMessage.value = `Are you sure you want to delete the rule "${rule.name}"?`;
  pendingDelete = { type: 'rule', id: rule.id };
  deleteDialogOpen.value = true;
}

function confirmDeleteChannel(channel) {
  deleteMessage.value = `Are you sure you want to delete the channel "${channel.name}"?`;
  pendingDelete = { type: 'channel', id: channel.id };
  deleteDialogOpen.value = true;
}

async function executeDelete() {
  if (pendingDelete?.type === 'rule') {
    await store.deleteRule(pendingDelete.id);
  } else if (pendingDelete?.type === 'channel') {
    await store.deleteChannel(pendingDelete.id);
  }
  pendingDelete = null;
  deleteDialogOpen.value = false;
}

// --- Clear History ---
const clearHistoryDialogOpen = ref(false);

function confirmClearHistory() {
  clearHistoryDialogOpen.value = true;
}

async function executeClearHistory() {
  await store.clearHistory();
  clearHistoryDialogOpen.value = false;
}

// --- Helpers ---
function severityColor(severity) {
  switch (severity) {
    case 'critical': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'info';
    default: return 'grey';
  }
}

// --- Lifecycle ---
onMounted(async () => {
  await Promise.all([
    store.fetchRules(),
    store.fetchChannels(),
    store.fetchHistory(),
  ]);
});
</script>
