<template>
  <div class="notification-settings">
    <Tabs :value="activeTab" @update:value="activeTab = $event">
      <TabList>
        <Tab value="incidents">Incidents</Tab>
        <Tab value="rules">Rules</Tab>
        <Tab value="channels">Channels</Tab>
        <Tab value="history">History</Tab>
        <Tab value="settings">Settings</Tab>
      </TabList>
      <TabPanels>
        <!-- ==================== Incidents ==================== -->
        <TabPanel value="incidents">
          <div class="tab-toolbar">
            <Select
              v-model="incidentStatusFilter"
              :options="INCIDENT_STATUSES"
              option-label="label"
              option-value="value"
              style="width: 10rem"
            />
            <Button
              label="Refresh"
              icon="pi pi-refresh"
              severity="secondary"
              size="small"
              @click="incidentsQuery.refetch()"
              :loading="incidentsQuery.isLoading.value"
            />
            <span v-if="sseConnected" class="sse-badge connected">SSE Connected</span>
            <span v-else class="sse-badge disconnected">SSE Disconnected</span>
          </div>
          <IncidentTable
            :data="incidentsQuery.incidents.value ?? []"
            :loading="incidentsQuery.isLoading.value"
            :rules="rulesSimple"
            @acknowledge="handleAcknowledge"
            @resolve="handleResolve"
            @fix="handleFix"
          />
        </TabPanel>

        <!-- ==================== Rules ==================== -->
        <TabPanel value="rules">
          <div class="tab-toolbar">
            <Button
              label="Add Rule"
              icon="pi pi-plus"
              size="small"
              @click="openRuleEditor(null)"
            />
            <Button
              label="Refresh"
              icon="pi pi-refresh"
              severity="secondary"
              size="small"
              @click="rulesQuery.refetch()"
            />
          </div>
          <div v-if="rulesQuery.isLoading.value" class="loading-state">
            <ProgressBar mode="indeterminate" style="height: 4px" />
          </div>
          <div v-else-if="!rulesQuery.rules.value?.length" class="empty-state">
            No rules configured. Click "Add Rule" to create one.
          </div>
          <div v-else class="card-list">
            <div v-for="rule in rulesQuery.rules.value" :key="rule.id" class="rule-card">
              <div class="card-header">
                <strong>{{ rule.name }}</strong>
                <span class="rule-type">{{ ruleTypeLabel(rule.type) }}</span>
                <ToggleSwitch
                  :model-value="rule.enabled"
                  @update:model-value="toggleRuleEnabled(rule, $event)"
                  class="card-toggle"
                />
              </div>
              <div class="card-meta">
                <span v-if="rule.pollingIntervalMinutes">
                  Poll every {{ rule.pollingIntervalMinutes }}m
                </span>
                <span v-if="rule.channelIds?.length">
                  {{ rule.channelIds.length }} channel{{ rule.channelIds.length > 1 ? 's' : '' }}
                </span>
                <span>{{ conditionsSummary(rule) }}</span>
              </div>
              <div class="card-actions">
                <Button label="Edit" size="small" text @click="openRuleEditor(rule)" />
                <Button
                  label="Test"
                  size="small"
                  severity="info"
                  text
                  :loading="testingRuleId === rule.id"
                  @click="handleTestRule(rule.id)"
                />
                <Button
                  label="Delete"
                  size="small"
                  severity="danger"
                  text
                  @click="handleDeleteRule(rule.id)"
                />
              </div>
            </div>
          </div>
        </TabPanel>

        <!-- ==================== Channels ==================== -->
        <TabPanel value="channels">
          <div class="tab-toolbar">
            <Button
              label="Add Channel"
              icon="pi pi-plus"
              size="small"
              @click="openChannelEditor(null)"
            />
            <Button
              label="Refresh"
              icon="pi pi-refresh"
              severity="secondary"
              size="small"
              @click="channelsQuery.refetch()"
            />
          </div>
          <div v-if="channelsQuery.isLoading.value" class="loading-state">
            <ProgressBar mode="indeterminate" style="height: 4px" />
          </div>
          <div v-else-if="!channelsQuery.channels.value?.length" class="empty-state">
            No channels configured. Click "Add Channel" to create one.
          </div>
          <div v-else class="card-list">
            <div v-for="ch in channelsQuery.channels.value" :key="ch.id" class="channel-card">
              <div class="card-header">
                <strong>{{ ch.name }}</strong>
                <span class="channel-type">{{ ch.type }}</span>
                <ToggleSwitch
                  :model-value="ch.enabled"
                  @update:model-value="toggleChannelEnabled(ch, $event)"
                  class="card-toggle"
                />
              </div>
              <div class="card-meta">
                <span class="webhook-mask">{{ (ch.config as Record<string, string>).webhookUrl ?? '' }}</span>
              </div>
              <div class="card-actions">
                <Button label="Edit" size="small" text @click="openChannelEditor(ch)" />
                <Button
                  label="Delete"
                  size="small"
                  severity="danger"
                  text
                  @click="handleDeleteChannel(ch.id)"
                />
              </div>
            </div>
          </div>
        </TabPanel>

        <!-- ==================== History ==================== -->
        <TabPanel value="history">
          <div class="tab-toolbar">
            <Button
              label="Refresh"
              icon="pi pi-refresh"
              severity="secondary"
              size="small"
              @click="historyQuery.refetch()"
            />
            <Button
              label="Clear History"
              icon="pi pi-trash"
              severity="danger"
              size="small"
              text
              @click="handleClearHistory"
              :disabled="!historyQuery.history.value?.length"
            />
          </div>
          <HistoryTable
            :data="historyQuery.history.value ?? []"
            :loading="historyQuery.isLoading.value"
          />
        </TabPanel>

        <!-- ==================== Settings ==================== -->
        <TabPanel value="settings">
          <div class="settings-form">
            <div class="field">
              <label>Polling Interval (minutes)</label>
              <div class="field-row">
                <InputNumber
                  v-model="pollingInterval"
                  :min="1"
                  :max="120"
                  style="width: 8rem"
                />
                <Button
                  label="Save"
                  size="small"
                  @click="handleSaveSettings"
                  :loading="settingsQuery.updateSettings.isPending.value"
                />
              </div>
              <small class="field-hint">How often the backend checks rules (1-120 minutes).</small>
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <!-- Rule Editor Dialog -->
    <RuleEditor
      :visible="ruleEditorOpen"
      @update:visible="ruleEditorOpen = $event"
      :editing-rule="editingRule"
      :channels="channelsQuery.channels.value ?? []"
      @save="handleSaveRule"
      ref="ruleEditorRef"
    />

    <!-- Channel Editor Dialog -->
    <ChannelEditor
      :visible="channelEditorOpen"
      @update:visible="channelEditorOpen = $event"
      :editing-channel="editingChannel"
      @save="handleSaveChannel"
      @test="handleTestChannel"
      ref="channelEditorRef"
    />

    <!-- Fix Commands Dialog -->
    <Dialog
      v-model:visible="fixDialogOpen"
      header="Fix Commands"
      modal
      :style="{ width: '50rem' }"
    >
      <div v-if="fixLoading" class="loading-state">
        <ProgressBar mode="indeterminate" style="height: 4px" />
      </div>
      <div v-else-if="fixScript">
        <p class="fix-hint">Copy and run this script on your graph node machine:</p>
        <div class="fix-script-block">{{ fixScript }}</div>
        <Button
          label="Copy Script"
          icon="pi pi-copy"
          severity="secondary"
          size="small"
          @click="copyToClipboard(fixScript)"
          class="mt-2"
        />
      </div>
      <div v-else class="empty-state">No fix commands available for this incident.</div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import Select from 'primevue/select';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import ProgressBar from 'primevue/progressbar';
import Dialog from 'primevue/dialog';
import IncidentTable from '../components/notifications/IncidentTable.vue';
import HistoryTable from '../components/notifications/HistoryTable.vue';
import RuleEditor from '../components/notifications/RuleEditor.vue';
import ChannelEditor from '../components/notifications/ChannelEditor.vue';
import {
  useRules,
  useChannels,
  useNotificationHistory,
  useIncidents,
  useNotificationSettings,
  useIncidentSSE,
} from '../composables/queries/useNotifications';
import { useBrowserNotifications } from '../composables/util/useBrowserNotifications';
import { useFeatureFlagStore } from '../composables/state/useFeatureFlags';
import { useSnackbar } from '../composables/state/useSnackbar';
import type { RuleConfig, ChannelConfig, IncidentRecord } from '@indexer-tools/shared';

const snackbar = useSnackbar();
const featureFlags = useFeatureFlagStore();
const { handleIncidentEvent } = useBrowserNotifications();

// ---------- Tab state ----------

const activeTab = ref('incidents');

const INCIDENT_STATUSES = [
  { label: 'Open', value: 'open' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'All', value: 'all' },
];

const incidentStatusFilter = ref('open');

// ---------- Query composables ----------

const rulesQuery = useRules();
const channelsQuery = useChannels();
const historyQuery = useNotificationHistory();
const incidentsQuery = useIncidents(incidentStatusFilter);
const settingsQuery = useNotificationSettings();
const { sseConnected, lastEvent, connect: connectSSE, disconnect: disconnectSSE } =
  useIncidentSSE();

// Rules as simple list for IncidentTable
const rulesSimple = computed(() =>
  (rulesQuery.rules.value ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
  })),
);

// ---------- Settings ----------

const pollingInterval = ref(60);

watch(
  () => settingsQuery.settings.value,
  (s) => {
    if (s) pollingInterval.value = s.pollingIntervalMinutes;
  },
  { immediate: true },
);

async function handleSaveSettings() {
  try {
    await settingsQuery.updateSettings.mutateAsync({
      pollingIntervalMinutes: pollingInterval.value,
    });
    snackbar.success('Settings saved');
  } catch (e) {
    snackbar.error('Failed to save settings');
  }
}

// ---------- Incident actions ----------

async function handleAcknowledge(id: string) {
  try {
    await incidentsQuery.acknowledge.mutateAsync(id);
    snackbar.success('Incident acknowledged');
  } catch {
    snackbar.error('Failed to acknowledge incident');
  }
}

async function handleResolve(id: string) {
  try {
    await incidentsQuery.resolve.mutateAsync(id);
    snackbar.success('Incident resolved');
  } catch {
    snackbar.error('Failed to resolve incident');
  }
}

// Fix commands dialog
const fixDialogOpen = ref(false);
const fixLoading = ref(false);
const fixScript = ref('');

async function handleFix(incident: IncidentRecord) {
  fixDialogOpen.value = true;
  fixLoading.value = true;
  fixScript.value = '';
  try {
    const result = await incidentsQuery.fetchFixCommands(incident.id);
    fixScript.value = result.script || '';
  } catch (e) {
    snackbar.error('Failed to fetch fix commands');
    fixDialogOpen.value = false;
  } finally {
    fixLoading.value = false;
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  snackbar.success('Copied to clipboard');
}

// ---------- Rule editor ----------

const ruleEditorOpen = ref(false);
const editingRule = ref<RuleConfig | null>(null);
const ruleEditorRef = ref<InstanceType<typeof RuleEditor> | null>(null);
const testingRuleId = ref<string | null>(null);

const RULE_TYPE_LABELS: Record<string, string> = {
  allocation_duration: 'Allocation Duration',
  signal_drop: 'Signal Drop',
  proportion: 'Proportion',
  subgraph_upgrade: 'Subgraph Upgrade',
  failed_subgraph_allocated: 'Failed Subgraph',
  behind_chainhead_allocated: 'Behind Chainhead',
  negative_stake: 'Negative Stake',
};

function ruleTypeLabel(type: string): string {
  return RULE_TYPE_LABELS[type] ?? type;
}

function conditionsSummary(rule: RuleConfig): string {
  const c = rule.conditions as Record<string, unknown>;
  if (rule.type === 'allocation_duration') return `>${c.hours ?? '?'}h`;
  if (rule.type === 'signal_drop') return `>${c.percentage ?? '?'}% drop`;
  if (rule.type === 'proportion') return `min ${c.minProportion ?? '?'}`;
  if (rule.type === 'subgraph_upgrade') return `min ${c.minGrt ?? '?'} GRT, max ${c.maxApr ?? '?'}%`;
  if (rule.type === 'behind_chainhead_allocated') return `>${c.behindBlocks ?? '?'} blocks`;
  return '';
}

function openRuleEditor(rule: RuleConfig | null) {
  editingRule.value = rule;
  ruleEditorOpen.value = true;
}

async function handleSaveRule(data: Partial<RuleConfig>) {
  try {
    if (data.id) {
      await rulesQuery.updateRule.mutateAsync(data as Partial<RuleConfig> & { id: string });
      snackbar.success('Rule updated');
    } else {
      await rulesQuery.createRule.mutateAsync(data);
      snackbar.success('Rule created');
    }
    ruleEditorOpen.value = false;
  } catch {
    snackbar.error('Failed to save rule');
  } finally {
    ruleEditorRef.value?.resetSubmitting();
  }
}

async function handleDeleteRule(id: string) {
  try {
    await rulesQuery.deleteRule.mutateAsync(id);
    snackbar.success('Rule deleted');
  } catch {
    snackbar.error('Failed to delete rule');
  }
}

async function handleTestRule(id: string) {
  testingRuleId.value = id;
  try {
    await rulesQuery.testRule.mutateAsync(id);
    snackbar.success('Rule test sent');
  } catch (e: unknown) {
    snackbar.error('Rule test failed: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    testingRuleId.value = null;
  }
}

async function toggleRuleEnabled(rule: RuleConfig, enabled: boolean) {
  try {
    await rulesQuery.updateRule.mutateAsync({
      id: rule.id,
      enabled,
    });
  } catch {
    snackbar.error('Failed to toggle rule');
  }
}

// ---------- Channel editor ----------

const channelEditorOpen = ref(false);
const editingChannel = ref<ChannelConfig | null>(null);
const channelEditorRef = ref<InstanceType<typeof ChannelEditor> | null>(null);

function openChannelEditor(channel: ChannelConfig | null) {
  editingChannel.value = channel;
  channelEditorOpen.value = true;
}

async function handleSaveChannel(data: Partial<ChannelConfig> & { webhookUrl?: string }) {
  try {
    if (data.id) {
      await channelsQuery.updateChannel.mutateAsync(data as Partial<ChannelConfig> & { id: string });
      snackbar.success('Channel updated');
    } else {
      await channelsQuery.createChannel.mutateAsync(data);
      snackbar.success('Channel created');
    }
    channelEditorOpen.value = false;
  } catch {
    snackbar.error('Failed to save channel');
  } finally {
    channelEditorRef.value?.resetSubmitting();
  }
}

async function handleDeleteChannel(id: string) {
  try {
    await channelsQuery.deleteChannel.mutateAsync(id);
    snackbar.success('Channel deleted');
  } catch {
    snackbar.error('Failed to delete channel');
  }
}

async function handleTestChannel(webhookUrl: string) {
  try {
    await channelsQuery.testChannel.mutateAsync(webhookUrl);
    channelEditorRef.value?.setTestResult(true, 'Test notification sent!');
  } catch (e: unknown) {
    channelEditorRef.value?.setTestResult(
      false,
      e instanceof Error ? e.message : 'Test failed',
    );
  }
}

async function toggleChannelEnabled(channel: ChannelConfig, enabled: boolean) {
  try {
    await channelsQuery.updateChannel.mutateAsync({
      id: channel.id,
      enabled,
    });
  } catch {
    snackbar.error('Failed to toggle channel');
  }
}

// ---------- History ----------

async function handleClearHistory() {
  try {
    await historyQuery.clearHistory.mutateAsync();
    snackbar.success('History cleared');
  } catch {
    snackbar.error('Failed to clear history');
  }
}

// ---------- Tab change: load data ----------

watch(activeTab, (tab) => {
  if (tab === 'incidents') {
    incidentsQuery.refetch();
  } else if (tab === 'settings') {
    settingsQuery.refetch();
  }
});

// ---------- SSE -> browser notification bridge ----------

watch(lastEvent, (event) => {
  if (event && featureFlags.isEnabled('browserNotifications')) {
    handleIncidentEvent(event);
  }
});

// ---------- Lifecycle ----------

onMounted(() => {
  connectSSE();
});

onUnmounted(() => {
  disconnectSSE();
});
</script>

<style scoped>
.notification-settings {
  display: flex;
  flex-direction: column;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.sse-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-weight: 500;
}

.sse-badge.connected {
  background: var(--p-green-100);
  color: var(--p-green-700);
}

.sse-badge.disconnected {
  background: var(--p-red-100);
  color: var(--p-red-700);
}

:deep(.dark-mode) .sse-badge.connected {
  background: var(--p-green-900);
  color: var(--p-green-300);
}

:deep(.dark-mode) .sse-badge.disconnected {
  background: var(--p-red-900);
  color: var(--p-red-300);
}

.loading-state {
  padding: 1rem 0;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rule-card,
.channel-card {
  border: 1px solid var(--app-surface-border);
  border-radius: var(--p-border-radius);
  padding: 0.75rem 1rem;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.card-toggle {
  margin-left: auto;
}

.rule-type,
.channel-type {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  background: var(--app-surface-elevated);
  color: var(--p-text-muted-color);
}

.card-meta {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.webhook-mask {
  font-family: monospace;
  font-size: 0.75rem;
}

.card-actions {
  display: flex;
  gap: 0.25rem;
}

.settings-form {
  max-width: 30rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.field-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.fix-hint {
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.fix-script-block {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre;
  max-height: 500px;
  overflow-y: auto;
}

.mt-2 {
  margin-top: 0.5rem;
}
</style>
