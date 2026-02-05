import { RuleScheduler } from './RuleScheduler.js';
import { SqliteStore } from '../../db/sqliteStore.js';
import type { HistoryRecord } from '../notifications/NotificationEngine.js';
import type { Allocation } from '@indexer-tools/shared';
import type { NetworkDataSnapshot, DeploymentStatus } from '../notifications/rules/Rule.js';

const DEFAULT_POLLING_INTERVAL_MINUTES = 60; // 1 hour

/**
 * PollingScheduler is a facade over RuleScheduler for backwards compatibility.
 * It delegates to RuleScheduler which handles per-rule scheduling internally.
 */
export class PollingScheduler {
  private ruleScheduler: RuleScheduler;
  private started = false;

  constructor(options: {
    store: SqliteStore;
    indexerAddress: string;
    pollingIntervalMinutes?: number;
    indexerStatusEndpoint?: string;
  }) {
    this.ruleScheduler = new RuleScheduler(options);
  }

  start(): void {
    if (this.started) {
      console.warn('PollingScheduler is already running');
      return;
    }

    this.started = true;
    this.ruleScheduler.start().catch((err) => {
      console.error('Failed to start RuleScheduler:', err);
    });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.ruleScheduler.stop();
  }

  updateInterval(newIntervalMinutes: number): void {
    this.ruleScheduler.updateGlobalInterval(newIntervalMinutes);
  }

  /**
   * Sync rule timers after rule configuration changes.
   * Call this after creating, updating, or deleting rules.
   */
  async syncRuleTimers(): Promise<void> {
    await this.ruleScheduler.syncRuleTimers();
  }

  /**
   * Evaluate all rules immediately.
   */
  async poll(): Promise<void> {
    await this.ruleScheduler.evaluateAllRules();
  }

  async testRule(ruleId: string): Promise<{
    triggered: boolean;
    notificationCount: number;
    sent: boolean;
    filterSummary?: string;
    error?: string;
    status?: number;
  }> {
    return this.ruleScheduler.testRule(ruleId);
  }

  // Expose cached data for external use
  get latestAllocations(): Allocation[] | null {
    return this.ruleScheduler.latestAllocations;
  }

  get latestNetworkData(): NetworkDataSnapshot | null {
    return this.ruleScheduler.latestNetworkData;
  }

  get latestDeploymentStatuses(): Map<string, DeploymentStatus> | undefined {
    return this.ruleScheduler.latestDeploymentStatuses;
  }
}
