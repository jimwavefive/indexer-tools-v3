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
                  <v-btn
                    icon
                    size="small"
                    variant="text"
                    color="success"
                    :loading="testingRuleId === item.id"
                    @click="testRule(item)"
                  >
                    <v-icon>mdi-play-circle-outline</v-icon>
                    <v-tooltip activator="parent" location="top">Test rule now</v-tooltip>
                  </v-btn>
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
                    v-if="item.status === 'open' && getAllowedActions(item.rule_id).includes('acknowledge')"
                    size="x-small"
                    variant="outlined"
                    class="mr-1"
                    @click="acknowledgeIncident(item)"
                  >Ack</v-btn>
                  <v-btn
                    v-if="item.status !== 'resolved' && getAllowedActions(item.rule_id).includes('resolve')"
                    size="x-small"
                    variant="outlined"
                    color="success"
                    class="mr-1"
                    @click="resolveIncident(item)"
                  >Resolve</v-btn>
                  <v-btn
                    v-if="featureFlagStore.isEnabled('agent') && item.status !== 'resolved' && canAutofix(item.rule_id)"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    @click="openAutofix(item)"
                  >
                    <v-icon start size="small">mdi-robot</v-icon>
                    Autofix
                  </v-btn>
                </template>
                <template #expanded-row="{ columns, item }">
                  <tr>
                    <td :colspan="columns.length" class="pa-4">
                      <div class="text-subtitle-2 mb-2">{{ item.latest_title }}</div>
                      <!-- Subgraphs detail table (replaces message for these rule types) -->
                      <div v-if="item.latest_metadata?.subgraphs?.length">
                        <template v-for="(value, key) in item.latest_metadata" :key="key">
                          <div v-if="shouldShowMetadataKey(key) && !isSubgraphsArray(key, value)" class="text-caption mb-1">
                            <strong>{{ metadataLabel(key) }}:</strong> {{ formatMetadataValue(key, value) }}
                          </div>
                        </template>
                        <v-table density="compact" class="text-caption mt-2">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Deployment</th>
                              <th class="text-right">GRT</th>
                              <th v-if="hasCloseable(item.latest_metadata.subgraphs)" class="text-center">Closeable</th>
                              <th v-if="hasBlocksBehind(item.latest_metadata.subgraphs)" class="text-right">Blocks Behind</th>
                              <th v-if="hasErrorMessage(item.latest_metadata.subgraphs)">Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(sg, idx) in item.latest_metadata.subgraphs" :key="idx">
                              <td>{{ sg.name }}</td>
                              <td style="font-family: monospace; font-size: 0.75rem">{{ sg.deploymentHash }}</td>
                              <td class="text-right">{{ Number(sg.allocatedGRT).toLocaleString() }}</td>
                              <td v-if="hasCloseable(item.latest_metadata.subgraphs)" class="text-center">
                                <v-chip :color="sg.closeable ? 'success' : 'grey'" size="x-small" label>{{ sg.closeable ? 'YES' : 'NO' }}</v-chip>
                              </td>
                              <td v-if="hasBlocksBehind(item.latest_metadata.subgraphs)" class="text-right">{{ sg.blocksBehind ? Number(sg.blocksBehind).toLocaleString() : '-' }}</td>
                              <td v-if="hasErrorMessage(item.latest_metadata.subgraphs)" class="text-caption" style="max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis" :title="sg.errorMessage">{{ sg.errorMessage || '-' }}</td>
                            </tr>
                          </tbody>
                        </v-table>
                      </div>
                      <!-- Standard message + metadata for other rule types -->
                      <template v-else>
                        <div class="text-body-2 mb-3">{{ item.latest_message }}</div>
                        <div v-if="item.latest_metadata">
                          <template v-for="(value, key) in item.latest_metadata" :key="key">
                            <div v-if="shouldShowMetadataKey(key)" class="text-caption">
                              <strong>{{ metadataLabel(key) }}:</strong> {{ formatMetadataValue(key, value) }}
                            </div>
                          </template>
                        </div>
                      </template>
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
                  <v-chip v-if="item.isTest" color="purple" size="x-small" label class="mr-1">TEST</v-chip>
                  <span v-if="item.incidentId" class="text-caption" :title="item.incidentId">
                    {{ item.incidentId.substring(0, 12) }}...
                  </span>
                  <span v-else-if="!item.isTest" class="text-caption text-grey">-</span>
                </template>
                <template #expanded-row="{ columns, item }">
                  <tr>
                    <td :colspan="columns.length" class="pa-4">
                      <div v-if="item.notification?.metadata?.subgraphs?.length">
                        <template v-for="(value, key) in item.notification.metadata" :key="key">
                          <div v-if="shouldShowMetadataKey(key) && !isSubgraphsArray(key, value)" class="text-caption mb-1">
                            <strong>{{ metadataLabel(key) }}:</strong> {{ formatMetadataValue(key, value) }}
                          </div>
                        </template>
                        <v-table density="compact" class="text-caption mt-2">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Deployment</th>
                              <th class="text-right">GRT</th>
                              <th v-if="hasCloseable(item.notification.metadata.subgraphs)" class="text-center">Closeable</th>
                              <th v-if="hasBlocksBehind(item.notification.metadata.subgraphs)" class="text-right">Blocks Behind</th>
                              <th v-if="hasErrorMessage(item.notification.metadata.subgraphs)">Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(sg, idx) in item.notification.metadata.subgraphs" :key="idx">
                              <td>{{ sg.name }}</td>
                              <td style="font-family: monospace; font-size: 0.75rem">{{ sg.deploymentHash }}</td>
                              <td class="text-right">{{ Number(sg.allocatedGRT).toLocaleString() }}</td>
                              <td v-if="hasCloseable(item.notification.metadata.subgraphs)" class="text-center">
                                <v-chip :color="sg.closeable ? 'success' : 'grey'" size="x-small" label>{{ sg.closeable ? 'YES' : 'NO' }}</v-chip>
                              </td>
                              <td v-if="hasBlocksBehind(item.notification.metadata.subgraphs)" class="text-right">{{ sg.blocksBehind ? Number(sg.blocksBehind).toLocaleString() : '-' }}</td>
                              <td v-if="hasErrorMessage(item.notification.metadata.subgraphs)" class="text-caption" style="max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis" :title="sg.errorMessage">{{ sg.errorMessage || '-' }}</td>
                            </tr>
                          </tbody>
                        </v-table>
                      </div>
                      <template v-else>
                        <div class="text-body-2 mb-2">{{ item.notification?.message }}</div>
                        <div v-if="item.notification?.metadata">
                          <template v-for="(value, key) in item.notification.metadata" :key="key">
                            <div v-if="shouldShowMetadataKey(key)" class="text-caption">
                              <strong>{{ metadataLabel(key) }}:</strong> {{ formatMetadataValue(key, value) }}
                            </div>
                          </template>
                        </div>
                      </template>
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
          <div v-if="ruleForm.type === 'failed_subgraph'" class="mb-2">
            <v-text-field
              v-model.number="ruleForm.conditions.minGrt"
              label="Min GRT Allocated"
              type="number"
              hint="Only alert for failed subgraphs with at least this much GRT allocated"
              persistent-hint
            ></v-text-field>
          </div>
          <div v-if="ruleForm.type === 'behind_chainhead'" class="mb-2">
            <v-text-field
              v-model.number="ruleForm.conditions.blocksBehindThreshold"
              label="Blocks Behind Threshold"
              type="number"
              hint="Alert when a subgraph is at least this many blocks behind chainhead"
              persistent-hint
            ></v-text-field>
          </div>

          <div class="mb-2">
            <div class="text-caption font-weight-bold mb-1">Allowed Incident Actions</div>
            <v-checkbox
              v-model="ruleForm.conditions.allowedActions"
              label="Acknowledge"
              value="acknowledge"
              hide-details
              density="compact"
            ></v-checkbox>
            <v-checkbox
              v-model="ruleForm.conditions.allowedActions"
              label="Resolve"
              value="resolve"
              hide-details
              density="compact"
            ></v-checkbox>
          </div>

          <v-text-field
            v-model.number="ruleForm.cooldownMinutes"
            label="Cooldown (minutes)"
            type="number"
            :min="5"
            :max="1440"
            hint="Override global cooldown for this rule (leave empty to use global setting)"
            persistent-hint
            clearable
            class="mb-2"
          ></v-text-field>

          <v-text-field
            v-model.number="ruleForm.pollingIntervalSeconds"
            label="Polling Interval (seconds)"
            type="number"
            :min="60"
            :max="3600"
            hint="Override global polling interval for this rule (leave empty to use global setting)"
            persistent-hint
            clearable
            class="mb-2"
          ></v-text-field>

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

    <!-- ========== SNACKBAR ========== -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="4000" location="bottom right">
      {{ snackbar.text }}
    </v-snackbar>

    <!-- ========== INCIDENT AGENT CHAT ========== -->
    <IncidentAgentChat v-if="featureFlagStore.isEnabled('agent')" />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationRulesStore } from '@/store/notificationRules';
import { useFeatureFlagStore } from '@/store/featureFlags';
import { useAgentStore } from '@/store/agent';
import IncidentAgentChat from '@/components/IncidentAgentChat.vue';

const router = useRouter();
const store = useNotificationRulesStore();
const featureFlagStore = useFeatureFlagStore();
const agentStore = useAgentStore();

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
  { title: 'Failed Subgraph', value: 'failed_subgraph' },
  { title: 'Behind Chainhead', value: 'behind_chainhead' },
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

// --- Test Rule ---
const testingRuleId = ref(null);
const snackbar = ref({ show: false, text: '', color: 'info' });

function showSnackbar(text, color = 'info') {
  snackbar.value = { show: true, text, color };
}

async function testRule(item) {
  testingRuleId.value = item.id;
  try {
    const result = await store.testRule(item.id);
    if (result.triggered) {
      showSnackbar(
        `Triggered: ${result.notificationCount} notification(s)${result.sent ? ' sent' : ' (no channels)'}`,
        'success',
      );
      store.fetchHistory();
    } else {
      showSnackbar('Rule did not trigger — conditions not met', 'warning');
    }
  } catch (err) {
    showSnackbar(err.message || 'Test failed', 'error');
  } finally {
    testingRuleId.value = null;
  }
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
    conditions: { allowedActions: ['acknowledge', 'resolve'] },
    channels: [],
    cooldownMinutes: null,
    pollingIntervalSeconds: null,
  };
}

function openRuleDialog(rule) {
  if (rule) {
    editingRule.value = rule;
    const conditions = { ...(rule.conditions || {}) };
    if (!Array.isArray(conditions.allowedActions)) {
      conditions.allowedActions = ['acknowledge', 'resolve'];
    }
    ruleForm.value = {
      name: rule.name,
      type: rule.type,
      enabled: rule.enabled,
      conditions,
      channels: rule.channels ? [...rule.channels] : [],
      cooldownMinutes: rule.cooldownMinutes ?? null,
      pollingIntervalSeconds: rule.pollingIntervalSeconds ?? null,
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

const METADATA_HIDDEN_KEYS = new Set(['subgraphs', 'count']);

const METADATA_LABEL_MAP = {
  minGrt: 'Min GRT Filter',
  blocksBehindThreshold: 'Blocks Behind Threshold',
  count: 'Count',
  allocatedGRT: 'Allocated GRT',
  apr: 'APR',
  epochDuration: 'Epoch Duration',
  thresholdEpochs: 'Threshold',
  ratio: 'Ratio',
  threshold: 'Threshold',
};

function metadataLabel(key) {
  return METADATA_LABEL_MAP[key] || key;
}

function shouldShowMetadataKey(key) {
  return !METADATA_HIDDEN_KEYS.has(key);
}

function isSubgraphsArray(key, value) {
  return key === 'subgraphs' && Array.isArray(value);
}

function hasCloseable(subgraphs) {
  return subgraphs.some((sg) => sg.closeable !== undefined);
}

function hasBlocksBehind(subgraphs) {
  return subgraphs.some((sg) => sg.blocksBehind !== undefined);
}

function hasErrorMessage(subgraphs) {
  return subgraphs.some((sg) => sg.errorMessage);
}

function formatMetadataValue(key, value) {
  if (value === null || value === undefined) return '-';

  if (key === 'subgraphId') {
    return truncateHash(String(value));
  }
  if (key === 'apr') {
    return `${(Number(value) * 100).toFixed(1)}%`;
  }
  if (key === 'allocatedGRT' || key === 'allocatedTokens' || key === 'minGrt') {
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
  if (key === 'blocksBehindThreshold') {
    return `${Number(value).toLocaleString()} blocks`;
  }
  return String(value);
}

function getAllowedActions(ruleId) {
  const rule = store.rules.find((r) => r.id === ruleId);
  const actions = rule?.conditions?.allowedActions;
  if (!Array.isArray(actions)) return ['acknowledge', 'resolve'];
  return actions;
}

// Rules that support AI-assisted autofix
const AUTOFIX_RULE_TYPES = ['failed_subgraph', 'behind_chainhead'];

function canAutofix(ruleId) {
  const rule = store.rules.find((r) => r.id === ruleId);
  if (!rule) return false;
  return AUTOFIX_RULE_TYPES.includes(rule.type);
}

function openAutofix(item) {
  agentStore.openIncidentChat(item.id);
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

