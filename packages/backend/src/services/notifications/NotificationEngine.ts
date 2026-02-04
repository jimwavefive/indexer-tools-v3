import type { Allocation } from '@indexer-tools/shared';
import type { Channel, Notification } from './channels/Channel.js';
import type { Rule, RuleContext, NetworkDataSnapshot, PreviousState, DeploymentStatus } from './rules/Rule.js';
import type { RuleConfig } from './rules/Rule.js';
import type { ChannelConfig } from './channels/Channel.js';
import { AllocationDurationRule } from './rules/AllocationDurationRule.js';
import { SignalDropRule } from './rules/SignalDropRule.js';
import { ProportionRule } from './rules/ProportionRule.js';
import { SubgraphUpgradeRule } from './rules/SubgraphUpgradeRule.js';
import { FailedSubgraphAllocatedRule } from './rules/FailedSubgraphAllocatedRule.js';
import { BehindChainheadAllocatedRule } from './rules/BehindChainheadAllocatedRule.js';
import { DiscordChannel } from './channels/DiscordChannel.js';
import type { SqliteStore } from '../../db/sqliteStore.js';

const DEFAULT_COOLDOWN_MINUTES = 60;

export interface HistoryRecord {
  id: string;
  incidentId?: string;
  notification: Notification;
  channelIds: string[];
  timestamp: string;
}

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

  constructor(options: { store: SqliteStore; onHistoryRecord?: (record: HistoryRecord) => void }) {
    this.store = options.store;
    this.onHistoryRecord = options?.onHistoryRecord;
  }

  async evaluate(
    allocations: Allocation[],
    networkData: NetworkDataSnapshot,
    ruleConfigs: RuleConfig[],
    channelConfigs: ChannelConfig[],
    deploymentStatuses?: Map<string, DeploymentStatus>,
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
    };

    const cooldownMinutes = parseInt(
      this.store.getSetting('cooldownMinutes') || String(DEFAULT_COOLDOWN_MINUTES),
      10,
    );
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = new Date();
    const nowIso = now.toISOString();

    // Track which rule:target combos fired this cycle for auto-resolution
    const firedKeys = new Set<string>();

    // Phase 1: Evaluate rules, manage incidents, decide what to send
    const toSend: Array<{ notification: Notification; incidentId: string }> = [];
    const filterSummaries = new Map<string, string>();

    for (const rule of rules) {
      const result = rule.evaluate(context);

      if (result.filterSummary) {
        filterSummaries.set(rule.id, result.filterSummary);
      }

      if (!result.triggered) continue;

      for (const notification of result.notifications) {
        const { key: targetKey, label: targetLabel } = deriveTargetKey(rule.id, notification);
        const incidentKey = `${rule.id}:${targetKey}`;
        firedKeys.add(incidentKey);

        const sentChannelIds = channels.map((c) => c.id);
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
            channel_ids: sentChannelIds,
          });

          // Skip re-notification for acknowledged incidents
          if (existing.status === 'acknowledged') {
            continue;
          }

          // Check cooldown: send again only if enough time has passed since last notification
          const lastNotified = new Date(existing.last_notified_at || existing.first_seen).getTime();
          if (now.getTime() - lastNotified >= cooldownMs) {
            toSend.push({ notification, incidentId: existing.id });
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
            channel_ids: sentChannelIds,
          });

          toSend.push({ notification, incidentId });
        }
      }
    }

    // Phase 2: Send batch to each channel
    if (toSend.length > 0 && channels.length > 0) {
      const notifications = toSend.map((s) => s.notification);
      const summaries = filterSummaries.size > 0 ? filterSummaries : undefined;
      for (const channel of channels) {
        try {
          await channel.sendBatch(notifications, summaries);
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
    const sentChannelIds = channels.map((c) => c.id);

    for (const { notification, incidentId } of toSend) {
      const record: HistoryRecord = {
        id: generateId(),
        incidentId,
        notification,
        channelIds: channels.length > 0 ? sentChannelIds : [],
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
    const resolved = this.store.autoResolveIncidents(firedKeys);
    if (resolved > 0) {
      console.log(`Auto-resolved ${resolved} incident(s)`);
    }

    // Update previous state for next evaluation
    this.updatePreviousState(allocations);

    return records;
  }

  private updatePreviousState(allocations: Allocation[]): void {
    this.previousState = {
      allocations: [...allocations],
    };
  }

  private instantiateRule(config: RuleConfig): Rule | null {
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
      case 'behind_chainhead':
        return new BehindChainheadAllocatedRule(config);
      default:
        console.warn(`Unknown rule type: ${config.type}`);
        return null;
    }
  }

  private instantiateChannel(config: ChannelConfig): Channel | null {
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
