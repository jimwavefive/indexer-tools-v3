import type { Allocation } from '@indexer-tools/shared';
import type { Channel, Notification } from './channels/Channel.js';
import type { Rule, RuleContext, NetworkDataSnapshot, PreviousState } from './rules/Rule.js';
import type { RuleConfig } from './rules/Rule.js';
import type { ChannelConfig } from './channels/Channel.js';
import { AllocationDurationRule } from './rules/AllocationDurationRule.js';
import { SignalDropRule } from './rules/SignalDropRule.js';
import { ProportionRule } from './rules/ProportionRule.js';
import { SubgraphUpgradeRule } from './rules/SubgraphUpgradeRule.js';
import { DiscordChannel } from './channels/DiscordChannel.js';

const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export interface HistoryRecord {
  id: string;
  notification: Notification;
  channelIds: string[];
  timestamp: string;
}

export class NotificationEngine {
  private cooldownMap = new Map<string, number>();
  private previousState: PreviousState = {
    allocations: [],
  };
  private history: HistoryRecord[] = [];
  private onHistoryRecord?: (record: HistoryRecord) => void;

  constructor(options?: { onHistoryRecord?: (record: HistoryRecord) => void }) {
    this.onHistoryRecord = options?.onHistoryRecord;
  }

  async evaluate(
    allocations: Allocation[],
    networkData: NetworkDataSnapshot,
    ruleConfigs: RuleConfig[],
    channelConfigs: ChannelConfig[],
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
    };

    // Phase 1: Collect all triggered notifications (applying cooldowns)
    const pending: Notification[] = [];
    const filterSummaries = new Map<string, string>();

    for (const rule of rules) {
      const result = rule.evaluate(context);

      if (result.filterSummary) {
        filterSummaries.set(rule.id, result.filterSummary);
      }

      if (!result.triggered) continue;

      for (const notification of result.notifications) {
        const allocationId =
          (notification.metadata?.allocationId as string) ??
          (notification.metadata?.subgraphId as string) ??
          'global';
        const cooldownKey = `${rule.id}:${allocationId}`;

        if (this.isOnCooldown(cooldownKey)) continue;

        this.setCooldown(cooldownKey);
        pending.push(notification);
      }
    }

    // Phase 2: Send batch to each channel
    const records: HistoryRecord[] = [];

    if (pending.length > 0 && channels.length > 0) {
      // Only include filter summaries alongside real notifications — never send a
      // digest containing only summaries, as that would repeat every poll cycle.
      const summaries = filterSummaries.size > 0 ? filterSummaries : undefined;
      for (const channel of channels) {
        try {
          await channel.sendBatch(pending, summaries);
        } catch (err) {
          console.error(
            `Failed to send batch via channel "${channel.name}" (${channel.id}):`,
            err,
          );
        }
      }
    }

    // Phase 3: Create history records
    const sentChannelIds = channels.map((c) => c.id);
    for (const notification of pending) {
      const record: HistoryRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        notification,
        channelIds: channels.length > 0 ? sentChannelIds : [],
        timestamp: new Date().toISOString(),
      };

      records.push(record);
      this.history.push(record);

      if (this.onHistoryRecord) {
        this.onHistoryRecord(record);
      }
    }

    // Update previous state for next evaluation
    this.updatePreviousState(allocations);

    return records;
  }

  private isOnCooldown(key: string): boolean {
    const lastTriggered = this.cooldownMap.get(key);
    if (!lastTriggered) return false;
    return Date.now() - lastTriggered < DEFAULT_COOLDOWN_MS;
  }

  private setCooldown(key: string): void {
    this.cooldownMap.set(key, Date.now());
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

  getHistory(): HistoryRecord[] {
    return this.history;
  }

  clearHistory(): void {
    this.history = [];
  }
}
