import type { Allocation, Notification, ChannelConfig, RuleConfig, HistoryRecord, IncidentChangeEvent } from '@indexer-tools/shared';
import type { Channel } from './channels/Channel.js';
import type { Rule, RuleContext, NetworkDataSnapshot, PreviousState, DeploymentStatus, IndexerData } from './rules/Rule.js';
import { AllocationDurationRule } from './rules/AllocationDurationRule.js';
import { SignalDropRule } from './rules/SignalDropRule.js';
import { ProportionRule } from './rules/ProportionRule.js';
import { SubgraphUpgradeRule } from './rules/SubgraphUpgradeRule.js';
import {
  FailedSubgraphAllocatedRule,
  FailedSubgraphStaleRule,
  FailedSubgraphDeterministicRule,
  FailedSubgraphNondeterministicRule,
} from './rules/FailedSubgraphAllocatedRule.js';
import { BehindChainheadAllocatedRule } from './rules/BehindChainheadAllocatedRule.js';
import { NegativeStakeRule } from './rules/NegativeStakeRule.js';
import { DiscordChannel } from './channels/DiscordChannel.js';
import type { SqliteStore } from '../../db/sqliteStore.js';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function deriveTargetKey(ruleId: string, notification: Notification): { key: string; label: string } {
  const meta = notification.metadata || {};
  const name = meta.subgraphName as string | undefined;
  const ipfs = (meta.deploymentIpfsHash || meta.latestDeploymentHash) as string | undefined;

  if (meta.allocationId) {
    const label = name && ipfs ? `${name} (${ipfs})` : name || ipfs || (meta.allocationId as string);
    return { key: `allocation:${meta.allocationId}`, label };
  }
  if (meta.subgraphId) {
    const deployHash = (meta.currentDeploymentHash || meta.deploymentIpfsHash) as string | undefined;
    const label = name && deployHash ? `${name} (${deployHash})` : name || (meta.subgraphId as string);
    const keySuffix = deployHash ? `:${deployHash}` : '';
    return { key: `subgraph:${meta.subgraphId}${keySuffix}`, label };
  }
  return { key: `global:${ruleId}`, label: ruleId };
}

export class NotificationEngine {
  private previousState: PreviousState = {
    allocations: [],
  };
  private store: SqliteStore;
  private onHistoryRecord?: (record: HistoryRecord) => void;
  private onIncidentChange?: (event: IncidentChangeEvent) => void;

  constructor(options: {
    store: SqliteStore;
    onHistoryRecord?: (record: HistoryRecord) => void;
    onIncidentChange?: (event: IncidentChangeEvent) => void;
  }) {
    this.store = options.store;
    this.onHistoryRecord = options?.onHistoryRecord;
    this.onIncidentChange = options?.onIncidentChange;
  }

  async evaluate(
    allocations: Allocation[],
    networkData: NetworkDataSnapshot,
    ruleConfigs: RuleConfig[],
    channelConfigs: ChannelConfig[],
    deploymentStatuses?: Map<string, DeploymentStatus>,
    indexer?: IndexerData,
  ): Promise<HistoryRecord[]> {
    const rules = ruleConfigs
      .filter((r) => r.enabled)
      .map((r) => this.instantiateRule(r))
      .filter((r): r is Rule => r !== null);

    const channels = channelConfigs
      .filter((c) => c.enabled)
      .map((c) => this.instantiateChannel(c))
      .filter((c): c is Channel => c !== null);

    const context: RuleContext = {
      allocations,
      networkData,
      previousState: this.previousState,
      deploymentStatuses,
      indexer,
    };

    const now = new Date();
    const nowIso = now.toISOString();

    // Build per-rule channel assignment lookup
    const ruleChannelMap = new Map<string, string[]>();
    for (const rc of ruleConfigs) {
      ruleChannelMap.set(rc.id, rc.channelIds ?? []);
    }

    // Track which rule:target combos fired this cycle for auto-resolution
    const firedKeys = new Set<string>();

    // Phase 1: Evaluate rules, manage incidents, decide what to send
    const toSend: Array<{ notification: Notification; incidentId: string; ruleChannelIds: string[] }> = [];
    const filterSummaries = new Map<string, string>();

    for (const rule of rules) {
      const ruleConfig = ruleConfigs.find((r) => r.id === rule.id);
      const result = rule.evaluate(context);

      if (result.filterSummary) {
        filterSummaries.set(rule.id, result.filterSummary);
      }

      if (!result.triggered) continue;

      // If groupIncidents is enabled, merge all notifications into one grouped notification
      let notifications = result.notifications;
      if (ruleConfig?.groupIncidents && notifications.length > 0) {
        const allocations = notifications.map((n) => ({
          ...n.metadata,
          title: n.title,
        }));
        const grouped: Notification = {
          title: `${notifications.length} ${ruleConfig.name || rule.id} alerts`,
          message: notifications[0].message,
          severity: notifications.reduce(
            (worst, n) =>
              n.severity === 'critical' ? 'critical' : n.severity === 'warning' && worst !== 'critical' ? 'warning' : worst,
            notifications[0].severity,
          ),
          timestamp: nowIso,
          ruleId: rule.id,
          metadata: {
            allocations,
            count: notifications.length,
          },
        };
        notifications = [grouped];
      }

      for (const notification of notifications) {
        // For grouped notifications, use rule-group target key instead of per-allocation
        const { key: targetKey, label: targetLabel } = ruleConfig?.groupIncidents
          ? { key: `rule-group:${rule.id}`, label: `${ruleConfig.name || rule.id} (grouped)` }
          : deriveTargetKey(rule.id, notification);
        const incidentKey = `${rule.id}:${targetKey}`;
        firedKeys.add(incidentKey);

        const ruleChIds = ruleChannelMap.get(rule.id) ?? [];
        // Fall back to default channel if rule has no specific channels assigned
        const resolvedChIds = ruleChIds.length > 0
          ? ruleChIds
          : (() => {
              const defaultId = this.store.getSetting('defaultChannelId');
              return defaultId ? [defaultId] : [];
            })();
        // Only channels that are both assigned to this rule AND globally enabled
        const effectiveChannelIds = resolvedChIds.length > 0
          ? channels.filter((c) => resolvedChIds.includes(c.id)).map((c) => c.id)
          : [];
        const existing = this.store.getActiveIncident(rule.id, targetKey);

        if (existing) {
          // Update existing incident metadata
          this.store.updateIncident(existing.id, {
            last_seen: nowIso,
            occurrence_count: existing.occurrence_count + 1,
            latest_title: notification.title,
            latest_message: notification.message,
            latest_metadata: (notification.metadata || {}) as Record<string, unknown>,
            severity: notification.severity,
            channel_ids: effectiveChannelIds,
          });

          this.onIncidentChange?.({
            type: 'updated',
            incidentId: existing.id,
            ruleId: rule.id,
            status: existing.status,
            severity: notification.severity,
            targetLabel,
            title: notification.title,
            timestamp: nowIso,
          });

          // Skip re-notification for acknowledged incidents
          if (existing.status === 'acknowledged') {
            continue;
          }

          // Only queue for sending if rule has channels assigned
          if (effectiveChannelIds.length > 0) {
            toSend.push({ notification, incidentId: existing.id, ruleChannelIds: effectiveChannelIds });
          }
        } else {
          // Create new incident
          const incidentId = generateId();
          this.store.createIncident({
            id: incidentId,
            rule_id: rule.id,
            target_key: targetKey,
            target_label: targetLabel,
            severity: notification.severity,
            status: 'open',
            auto_resolve: 1,
            first_seen: nowIso,
            last_seen: nowIso,
            last_notified_at: nowIso,
            resolved_at: null,
            occurrence_count: 1,
            latest_title: notification.title,
            latest_message: notification.message,
            latest_metadata: (notification.metadata || {}) as Record<string, unknown>,
            channel_ids: effectiveChannelIds,
          });

          this.onIncidentChange?.({
            type: 'created',
            incidentId,
            ruleId: rule.id,
            status: 'open',
            severity: notification.severity,
            targetLabel,
            title: notification.title,
            timestamp: nowIso,
          });

          // Only queue for sending if rule has channels assigned
          if (effectiveChannelIds.length > 0) {
            toSend.push({ notification, incidentId, ruleChannelIds: effectiveChannelIds });
          }
        }
      }
    }

    // Phase 2: Send batch to each channel (filtered by per-rule channel assignment)
    if (toSend.length > 0 && channels.length > 0) {
      const summaries = filterSummaries.size > 0 ? filterSummaries : undefined;
      for (const channel of channels) {
        // Only include notifications whose rule targets this channel
        const channelNotifications = toSend
          .filter((s) => s.ruleChannelIds.includes(channel.id))
          .map((s) => s.notification);

        if (channelNotifications.length === 0) continue;

        try {
          await channel.sendBatch(channelNotifications, summaries);
        } catch (err) {
          console.error(
            `Failed to send batch via channel "${channel.name}" (${channel.id}):`,
            err,
          );
        }
      }
    }

    // Phase 3: Create history records and update last_notified_at
    const records: HistoryRecord[] = [];

    for (const { notification, incidentId, ruleChannelIds } of toSend) {
      const record: HistoryRecord = {
        id: generateId(),
        incidentId,
        notification,
        channelIds: ruleChannelIds,
        timestamp: nowIso,
      };

      records.push(record);

      // Mark when this incident was last notified
      this.store.updateIncident(incidentId, { last_notified_at: nowIso });

      if (this.onHistoryRecord) {
        this.onHistoryRecord(record);
      }
    }

    // Phase 4: Auto-resolve incidents whose conditions no longer fire
    // Only auto-resolve for rules that were actually evaluated (enabled) --
    // disabled rules don't fire, so their incidents would be wrongly resolved.
    const enabledRuleIds = new Set(rules.map((r) => r.id));
    const { count: resolvedCount, resolvedIds } = this.store.autoResolveIncidents(firedKeys, enabledRuleIds);
    if (resolvedCount > 0) {
      console.log(`Auto-resolved ${resolvedCount} incident(s)`);

      if (this.onIncidentChange) {
        for (const id of resolvedIds) {
          const inc = this.store.getIncidentById(id);
          if (inc) {
            this.onIncidentChange({
              type: 'auto-resolved',
              incidentId: id,
              ruleId: inc.rule_id,
              status: 'resolved',
              severity: inc.severity,
              targetLabel: inc.target_label,
              title: inc.latest_title,
              timestamp: nowIso,
            });
          }
        }
      }
    }

    // Update previous state for next evaluation
    this.updatePreviousState(allocations);

    return records;
  }

  get currentPreviousState(): PreviousState {
    return this.previousState;
  }

  private updatePreviousState(allocations: Allocation[]): void {
    this.previousState = {
      allocations: [...allocations],
    };
  }

  instantiateRule(config: RuleConfig): Rule | null {
    switch (config.type) {
      case 'allocation_duration':
        return new AllocationDurationRule(config);
      case 'signal_drop':
        return new SignalDropRule(config);
      case 'proportion':
        return new ProportionRule(config);
      case 'subgraph_upgrade':
        return new SubgraphUpgradeRule(config);
      case 'failed_subgraph':
        return new FailedSubgraphAllocatedRule(config);
      case 'failed_subgraph_stale':
        return new FailedSubgraphStaleRule(config);
      case 'failed_subgraph_deterministic':
        return new FailedSubgraphDeterministicRule(config);
      case 'failed_subgraph_nondeterministic':
        return new FailedSubgraphNondeterministicRule(config);
      case 'behind_chainhead':
        return new BehindChainheadAllocatedRule(config);
      case 'negative_stake':
        return new NegativeStakeRule(config);
      default:
        console.warn(`Unknown rule type: ${config.type}`);
        return null;
    }
  }

  instantiateChannel(config: ChannelConfig): Channel | null {
    switch (config.type) {
      case 'discord':
        try {
          return new DiscordChannel(config);
        } catch (err) {
          console.error(`Failed to instantiate Discord channel "${config.name}":`, err);
          return null;
        }
      default:
        console.warn(`Unknown channel type: ${config.type}`);
        return null;
    }
  }
}
