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
        <v-tab value="incidents">
          <v-icon start>mdi-alert-circle-outline</v-icon>
          Incidents
        </v-tab>
        <v-tab value="history">
          <v-icon start>mdi-history</v-icon>
          History
        </v-tab>
        <v-tab value="settings">
          <v-icon start>mdi-cog</v-icon>
          Settings
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
                  <span class="text-medium-emphasis">
                    {{ item.config?.webhookUrl || '' }}
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

        <!-- ========== INCIDENTS TAB ========== -->
        <v-window-item value="incidents">
          <v-card flat>
            <v-card-text>
              <div class="d-flex align-center mb-4">
                <v-select
                  v-model="incidentStatusFilter"
                  :items="incidentStatusOptions"
                  label="Status"
                  density="compact"
                  hide-details
                  style="max-width: 200px"
                  @update:model-value="loadIncidents"
                ></v-select>
                <v-spacer></v-spacer>
                <v-btn variant="outlined" size="small" @click="loadIncidents">
                  <v-icon start>mdi-refresh</v-icon>
                  Refresh
                </v-btn>
              </div>

              <v-data-table
                :headers="incidentHeaders"
                :items="store.incidents"
                :loading="store.loading"
                items-per-page="25"
                show-expand
              >
                <template #item.status="{ item }">
                  <v-chip
                    :color="incidentStatusColor(item.status)"
                    size="small"
                    label
                  >
                    {{ item.status }}
                  </v-chip>
                </template>
                <template #item.severity="{ item }">
                  <v-chip
                    :color="severityColor(item.severity)"
                    size="small"
                    label
                  >
                    {{ item.severity }}
                  </v-chip>
                </template>
                <template #item.target_label="{ item }">
                  <span :title="item.target_key">{{ item.target_label }}</span>
                </template>
                <template #item.first_seen="{ item }">
                  {{ formatDate(item.first_seen) }}
                </template>
                <template #item.last_seen="{ item }">
                  {{ formatDate(item.last_seen) }}
                </template>
                <template #item.actions="{ item }">
                  <v-btn
                    v-if="item.status === 'open'"
                    size="x-small"
                    variant="outlined"
                    class="mr-1"
                    @click="acknowledgeIncident(item)"
                  >Ack</v-btn>
                  <v-btn
                    v-if="item.status !== 'resolved'"
                    size="x-small"
                    variant="outlined"
                    color="success"
                    @click="resolveIncident(item)"
                  >Resolve</v-btn>
                </template>
                <template #expanded-row="{ columns, item }">
                  <tr>
                    <td :colspan="columns.length" class="pa-4">
                      <div class="text-subtitle-2 mb-2">{{ item.latest_title }}</div>
                      <div class="text-body-2 mb-3">{{ item.latest_message }}</div>
                      <div v-if="item.latest_metadata && Object.keys(item.latest_metadata).length">
                        <div class="text-caption font-weight-bold mb-1">Metadata</div>
                        <div v-for="(value, key) in item.latest_metadata" :key="key" class="text-caption">
                          <strong>{{ key }}:</strong> {{ formatMetadataValue(key, value) }}
                        </div>
                      </div>
                    </td>
                  </tr>
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
                show-expand
              >
                <template #item.timestamp="{ item }">
                  {{ formatDate(item.timestamp) }}
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
                <template #item.incidentId="{ item }">
                  <span v-if="item.incidentId" class="text-caption" :title="item.incidentId">
                    {{ item.incidentId.substring(0, 12) }}...
                  </span>
                  <span v-else class="text-caption text-grey">-</span>
                </template>
                <template #expanded-row="{ columns, item }">
                  <tr>
                    <td :colspan="columns.length" class="pa-4">
                      <div class="text-body-2 mb-2">{{ item.notification?.message }}</div>
                      <div v-if="item.notification?.metadata && Object.keys(item.notification.metadata).length">
                        <div class="text-caption font-weight-bold mb-1">Metadata</div>
                        <div v-for="(value, key) in item.notification.metadata" :key="key" class="text-caption">
                          <strong>{{ key }}:</strong> {{ formatMetadataValue(key, value) }}
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </v-data-table>
            </v-card-text>
          </v-card>
        </v-window-item>

        <!-- ========== SETTINGS TAB ========== -->
        <v-window-item value="settings">
          <v-card flat>
            <v-card-text>
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model.number="settingsForm.pollingIntervalSeconds"
                    label="Polling Interval (seconds)"
                    type="number"
                    :min="60"
                    :max="3600"
                    hint="How often the backend checks for notification triggers (60-3600)"
                    persistent-hint
                  ></v-text-field>
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model.number="settingsForm.cooldownMinutes"
                    label="Cooldown Duration (minutes)"
                    type="number"
                    :min="5"
                    :max="1440"
                    hint="Minimum time before re-sending a notification for the same incident (5-1440)"
                    persistent-hint
                  ></v-text-field>
                </v-col>
              </v-row>
              <div class="d-flex justify-end mt-4">
                <v-btn color="primary" @click="saveSettings" :loading="store.loading">
                  <v-icon start>mdi-content-save</v-icon>
                  Save Settings
                </v-btn>
              </div>
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
          <div v-if="ruleForm.type === 'subgraph_upgrade'" class="mb-2">
            <v-text-field
              v-model.number="ruleForm.conditions.maxApr"
              label="Max APR (%)"
              type="number"
              hint="Only alert when subgraph APR is at or below this value (0 = no APR filter)"
              persistent-hint
            ></v-text-field>
            <v-text-field
              v-model.number="ruleForm.conditions.minGrt"
              label="Min GRT Allocated"
              type="number"
              hint="Only alert when allocated GRT is at or above this value"
              persistent-hint
              class="mt-2"
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
            :label="editingChannel ? 'Webhook URL (leave blank to keep existing)' : 'Webhook URL'"
            :placeholder="editingChannel ? 'Enter new URL or leave blank' : ''"
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
import { ref, onMounted, watch } from 'vue';
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

const tab = ref('incidents');

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

const incidentHeaders = [
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Rule', key: 'rule_id' },
  { title: 'Target', key: 'target_label' },
  { title: 'Severity', key: 'severity', width: '100px' },
  { title: 'First Seen', key: 'first_seen' },
  { title: 'Last Seen', key: 'last_seen' },
  { title: 'Count', key: 'occurrence_count', width: '80px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '160px' },
];

const historyHeaders = [
  { title: 'Timestamp', key: 'timestamp' },
  { title: 'Rule', key: 'notification.ruleId' },
  { title: 'Message', key: 'notification.title' },
  { title: 'Severity', key: 'notification.severity' },
  { title: 'Incident', key: 'incidentId', width: '130px' },
];

const ruleTypes = [
  { title: 'Allocation Duration', value: 'allocation_duration' },
  { title: 'Signal Drop', value: 'signal_drop' },
  { title: 'Proportion', value: 'proportion' },
  { title: 'Subgraph Upgrade', value: 'subgraph_upgrade' },
];

// --- Incident filtering ---
const incidentStatusFilter = ref('open');
const incidentStatusOptions = [
  { title: 'Open', value: 'open' },
  { title: 'Acknowledged', value: 'acknowledged' },
  { title: 'Resolved', value: 'resolved' },
  { title: 'All', value: 'all' },
];

function loadIncidents() {
  store.fetchIncidents(incidentStatusFilter.value);
}

async function acknowledgeIncident(item) {
  await store.acknowledgeIncident(item.id);
  loadIncidents();
}

async function resolveIncident(item) {
  await store.resolveIncident(item.id);
  loadIncidents();
}

// --- Settings ---
const settingsForm = ref({
  pollingIntervalSeconds: 600,
  cooldownMinutes: 60,
});

async function saveSettings() {
  await store.updateSettings({
    pollingIntervalSeconds: Math.max(60, Math.min(3600, settingsForm.value.pollingIntervalSeconds)),
    cooldownMinutes: Math.max(5, Math.min(1440, settingsForm.value.cooldownMinutes)),
  });
  settingsForm.value = { ...store.settings };
}

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
      // Webhook URL is masked in API response — leave blank so user re-enters or keeps existing
      webhookUrl: '',
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

function incidentStatusColor(status) {
  switch (status) {
    case 'open': return 'error';
    case 'acknowledged': return 'warning';
    case 'resolved': return 'success';
    default: return 'grey';
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function truncateHash(value) {
  if (!value || value.length < 12) return value || '-';
  if (value.startsWith('0x')) {
    return `${value.substring(0, 8)}...${value.substring(value.length - 6)}`;
  }
  if (value.startsWith('Qm') || value.startsWith('ba')) {
    return `${value.substring(0, 8)}...${value.substring(value.length - 4)}`;
  }
  return value;
}

function formatMetadataValue(key, value) {
  if (value === null || value === undefined) return '-';

  if (key === 'subgraphId') {
    return truncateHash(String(value));
  }
  if (key === 'apr') {
    return `${(Number(value) * 100).toFixed(1)}%`;
  }
  if (key === 'allocatedGRT' || key === 'allocatedTokens') {
    return Number(value).toLocaleString();
  }
  if (key === 'signalProportion' || key === 'stakeProportion') {
    return `${(Number(value) * 100).toFixed(4)}%`;
  }
  if (key === 'ratio' || key === 'threshold') {
    return Number(value).toFixed(4);
  }
  if (key === 'epochDuration' || key === 'thresholdEpochs') {
    return `${value} epochs`;
  }
  return String(value);
}

// --- Tab change: load data for active tab ---
watch(tab, (newTab) => {
  if (newTab === 'incidents') {
    loadIncidents();
  } else if (newTab === 'settings') {
    store.fetchSettings().then(() => {
      settingsForm.value = { ...store.settings };
    });
  }
});

// --- Lifecycle ---
onMounted(async () => {
  await Promise.all([
    store.fetchRules(),
    store.fetchChannels(),
    store.fetchHistory(),
    store.fetchIncidents(incidentStatusFilter.value),
  ]);
});
</script>
