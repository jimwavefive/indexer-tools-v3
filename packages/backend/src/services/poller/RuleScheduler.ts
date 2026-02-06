import { NetworkPoller } from './NetworkPoller.js';
import { NotificationEngine, type HistoryRecord } from '../notifications/NotificationEngine.js';
import { SqliteStore } from '../../db/sqliteStore.js';
import type { Allocation } from '@indexer-tools/shared';
import type { NetworkDataSnapshot, DeploymentStatus, IndexerData, RuleConfig } from '../notifications/rules/Rule.js';
import type { Channel } from '../notifications/channels/Channel.js';

const DEFAULT_POLLING_INTERVAL_MINUTES = 60; // 1 hour
const MIN_DATA_FETCH_INTERVAL_MS = 60 * 1000; // Minimum 1 minute between data fetches

interface RuleTimer {
  ruleId: string;
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
}

interface CachedData {
  allocations: Allocation[];
  networkData: NetworkDataSnapshot;
  deploymentStatuses?: Map<string, DeploymentStatus>;
  indexer?: IndexerData;
  fetchedAt: number;
}

/**
 * RuleScheduler manages independent polling timers per rule.
 * It maintains a shared data cache to avoid redundant network fetches
 * while allowing each rule to evaluate on its own schedule.
 */
export class RuleScheduler {
  private poller: NetworkPoller;
  private engine: NotificationEngine;
  private store: SqliteStore;
  private indexerAddress: string;
  private indexerStatusEndpointOverride?: string;
  private resolvedStatusEndpoint?: string;
  private globalIntervalMs: number;

  private ruleTimers: Map<string, RuleTimer> = new Map();
  private dataCache: CachedData | null = null;
  private fetchingData = false;
  private dataFetchPromise: Promise<CachedData | null> | null = null;

  constructor(options: {
    store: SqliteStore;
    indexerAddress: string;
    pollingIntervalMinutes?: number;
    indexerStatusEndpoint?: string;
  }) {
    this.poller = new NetworkPoller();
    this.store = options.store;
    this.indexerAddress = options.indexerAddress;
    this.indexerStatusEndpointOverride = options.indexerStatusEndpoint;
    this.globalIntervalMs =
      (options.pollingIntervalMinutes ?? DEFAULT_POLLING_INTERVAL_MINUTES) * 60 * 1000;

    this.engine = new NotificationEngine({
      store: this.store,
      onHistoryRecord: (record) => {
        this.store.addHistory(record).catch((err) => {
          console.error('Failed to persist history record:', err);
        });
      },
    });
  }

  async start(): Promise<void> {
    console.log(
      `RuleScheduler starting for indexer ${this.indexerAddress} (global interval: ${this.globalIntervalMs / 60000}m)`,
    );

    // Initial data fetch
    await this.refreshDataCache();

    // Set up timers for all enabled rules
    await this.syncRuleTimers();

    console.log('RuleScheduler started');
  }

  stop(): void {
    for (const [ruleId, ruleTimer] of this.ruleTimers) {
      if (ruleTimer.timer) {
        clearInterval(ruleTimer.timer);
        ruleTimer.timer = null;
      }
    }
    this.ruleTimers.clear();
    console.log('RuleScheduler stopped');
  }

  /**
   * Synchronize rule timers with current rule configurations.
   * Call this after rules are added, removed, or have their polling interval changed.
   */
  async syncRuleTimers(): Promise<void> {
    const rules = await this.store.getRules();
    const enabledRules = rules.filter((r) => r.enabled);
    const enabledRuleIds = new Set(enabledRules.map((r) => r.id));

    // Remove timers for deleted or disabled rules
    for (const [ruleId, ruleTimer] of this.ruleTimers) {
      if (!enabledRuleIds.has(ruleId)) {
        if (ruleTimer.timer) {
          clearInterval(ruleTimer.timer);
        }
        this.ruleTimers.delete(ruleId);
        console.log(`RuleScheduler: removed timer for rule ${ruleId}`);
      }
    }

    // Add or update timers for enabled rules
    for (const rule of enabledRules) {
      const intervalMs = (rule.pollingIntervalMinutes ?? this.globalIntervalMs / 60000) * 60 * 1000;
      const existing = this.ruleTimers.get(rule.id);

      if (existing) {
        // Update interval if changed
        if (existing.intervalMs !== intervalMs) {
          if (existing.timer) {
            clearInterval(existing.timer);
          }
          existing.intervalMs = intervalMs;
          existing.timer = setInterval(() => {
            this.evaluateRule(rule.id).catch((err) =>
              console.error(`Scheduled evaluation for rule ${rule.id} failed:`, err)
            );
          }, intervalMs);
          console.log(`RuleScheduler: updated timer for rule ${rule.id} to ${intervalMs / 60000}m`);
        }
      } else {
        // Create new timer
        const timer = setInterval(() => {
          this.evaluateRule(rule.id).catch((err) =>
            console.error(`Scheduled evaluation for rule ${rule.id} failed:`, err)
          );
        }, intervalMs);

        this.ruleTimers.set(rule.id, {
          ruleId: rule.id,
          intervalMs,
          timer,
        });

        console.log(`RuleScheduler: created timer for rule ${rule.id} (${intervalMs / 60000}m)`);

        // Run initial evaluation immediately
        this.evaluateRule(rule.id).catch((err) =>
          console.error(`Initial evaluation for rule ${rule.id} failed:`, err)
        );
      }
    }
  }

  /**
   * Update the global polling interval.
   */
  updateGlobalInterval(newIntervalMinutes: number): void {
    this.globalIntervalMs = newIntervalMinutes * 60 * 1000;
    console.log(`RuleScheduler: global interval updated to ${newIntervalMinutes}m`);
    // Resync timers to pick up rules that use global interval
    this.syncRuleTimers().catch((err) =>
      console.error('Failed to sync rule timers after interval update:', err)
    );
  }

  /**
   * Refresh the shared data cache.
   * Returns cached data if recently fetched, otherwise fetches new data.
   */
  private async refreshDataCache(): Promise<CachedData | null> {
    // If we have recent cached data, return it
    if (this.dataCache && Date.now() - this.dataCache.fetchedAt < MIN_DATA_FETCH_INTERVAL_MS) {
      return this.dataCache;
    }

    // If a fetch is already in progress, wait for it
    if (this.fetchingData && this.dataFetchPromise) {
      return this.dataFetchPromise;
    }

    // Start a new fetch
    this.fetchingData = true;
    this.dataFetchPromise = this.doFetchData();

    try {
      const result = await this.dataFetchPromise;
      return result;
    } finally {
      this.fetchingData = false;
      this.dataFetchPromise = null;
    }
  }

  private async doFetchData(): Promise<CachedData | null> {
    try {
      console.log('RuleScheduler: fetching network data...');

      const [allocations, networkData, indexer] = await Promise.all([
        this.poller.fetchAllocations(this.indexerAddress),
        this.poller.fetchNetworkData(),
        this.poller.fetchIndexerData(this.indexerAddress).catch((err) => {
          console.error('Failed to fetch indexer data:', err);
          return null;
        }),
      ]);

      console.log(
        `RuleScheduler: fetched ${allocations.length} allocations, epoch ${networkData.currentEpoch}${indexer ? `, availableStake=${indexer.availableStake}` : ''}`,
      );

      // Fetch deployment statuses
      let deploymentStatuses: Map<string, DeploymentStatus> | undefined;
      const statusEndpoint = await this.resolveStatusEndpoint();
      if (statusEndpoint) {
        try {
          const deploymentHashes = [...new Set(allocations.map((a) => a.subgraphDeployment.ipfsHash))];
          deploymentStatuses = await this.poller.fetchDeploymentStatuses(statusEndpoint, deploymentHashes);
          console.log(`RuleScheduler: fetched ${deploymentStatuses.size} deployment statuses`);
        } catch (err) {
          console.error('Failed to fetch deployment statuses:', err);
          if (!this.indexerStatusEndpointOverride) {
            this.resolvedStatusEndpoint = undefined;
          }
        }
      }

      this.dataCache = {
        allocations,
        networkData,
        deploymentStatuses,
        indexer: indexer ?? undefined,
        fetchedAt: Date.now(),
      };

      return this.dataCache;
    } catch (err) {
      console.error('RuleScheduler: data fetch error:', err);
      return null;
    }
  }

  /**
   * Evaluate a single rule.
   */
  async evaluateRule(ruleId: string): Promise<HistoryRecord[]> {
    const rules = await this.store.getRules();
    const ruleConfig = rules.find((r) => r.id === ruleId);

    if (!ruleConfig || !ruleConfig.enabled) {
      return [];
    }

    // Refresh data cache
    const data = await this.refreshDataCache();
    if (!data) {
      console.warn(`RuleScheduler: no data available, skipping rule ${ruleId}`);
      return [];
    }

    const channels = await this.store.getChannels();

    // Evaluate only this rule
    const records = await this.engine.evaluate(
      data.allocations,
      data.networkData,
      [ruleConfig], // Only evaluate this rule
      channels,
      data.deploymentStatuses,
      data.indexer,
    );

    // Update last_polled_at for this rule
    this.store.updateRuleLastPolledAt(ruleId, new Date().toISOString());

    if (records.length > 0) {
      console.log(`RuleScheduler: rule ${ruleId} triggered ${records.length} notification(s)`);
    }

    return records;
  }

  /**
   * Evaluate all enabled rules immediately (for manual trigger/testing).
   */
  async evaluateAllRules(): Promise<HistoryRecord[]> {
    // Refresh data cache
    const data = await this.refreshDataCache();
    if (!data) {
      console.warn('RuleScheduler: no data available for full evaluation');
      return [];
    }

    const rules = await this.store.getRules();
    const channels = await this.store.getChannels();

    const records = await this.engine.evaluate(
      data.allocations,
      data.networkData,
      rules,
      channels,
      data.deploymentStatuses,
      data.indexer,
    );

    // Update last_polled_at for all enabled rules
    const now = new Date().toISOString();
    for (const rule of rules.filter((r) => r.enabled)) {
      this.store.updateRuleLastPolledAt(rule.id, now);
    }

    return records;
  }

  /**
   * Test a specific rule without creating incidents or sending notifications.
   */
  async testRule(ruleId: string): Promise<{
    triggered: boolean;
    notificationCount: number;
    sent: boolean;
    filterSummary?: string;
    error?: string;
    status?: number;
  }> {
    const data = await this.refreshDataCache();
    if (!data) {
      return { triggered: false, notificationCount: 0, sent: false, error: 'No data available — wait for data fetch', status: 503 };
    }

    const rules = await this.store.getRules();
    const ruleConfig = rules.find((r) => r.id === ruleId);
    if (!ruleConfig) {
      return { triggered: false, notificationCount: 0, sent: false, error: 'Rule not found', status: 404 };
    }

    const rule = this.engine.instantiateRule(ruleConfig);
    if (!rule) {
      return { triggered: false, notificationCount: 0, sent: false, error: `Unknown rule type: ${ruleConfig.type}`, status: 400 };
    }

    const context = {
      allocations: data.allocations,
      networkData: data.networkData,
      previousState: this.engine.currentPreviousState,
      deploymentStatuses: data.deploymentStatuses,
      indexer: data.indexer,
    };

    const result = rule.evaluate(context);

    if (!result.triggered || result.notifications.length === 0) {
      return { triggered: false, notificationCount: 0, sent: false, filterSummary: result.filterSummary };
    }

    // Send via enabled channels
    const channelConfigs = await this.store.getChannels();
    const channels: Channel[] = channelConfigs
      .filter((c) => c.enabled)
      .map((c) => this.engine.instantiateChannel(c))
      .filter((c): c is Channel => c !== null);

    let sent = false;
    if (channels.length > 0) {
      const summaries = result.filterSummary ? new Map([[rule.id, result.filterSummary]]) : undefined;
      for (const channel of channels) {
        try {
          await channel.sendBatch(result.notifications, summaries);
          sent = true;
        } catch (err) {
          console.error(`[testRule] Failed to send via channel "${channel.name}":`, err);
        }
      }
    }

    // Create history records tagged as test
    const nowIso = new Date().toISOString();
    const sentChannelIds = channels.map((c) => c.id);
    const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    for (const notification of result.notifications) {
      const record: HistoryRecord = {
        id: generateId(),
        notification,
        channelIds: sent ? sentChannelIds : [],
        timestamp: nowIso,
        isTest: true,
      };
      await this.store.addHistory(record);
    }

    return {
      triggered: true,
      notificationCount: result.notifications.length,
      sent,
      filterSummary: result.filterSummary,
    };
  }

  private async resolveStatusEndpoint(): Promise<string | undefined> {
    if (this.indexerStatusEndpointOverride) {
      return this.indexerStatusEndpointOverride;
    }

    if (this.resolvedStatusEndpoint) {
      return this.resolvedStatusEndpoint;
    }

    try {
      const indexerUrl = await this.poller.fetchIndexerUrl(this.indexerAddress);
      if (!indexerUrl) {
        console.warn('Indexer has no URL registered on-chain — status-based rules will be inactive');
        return undefined;
      }

      const statusUrl = new URL('/status', indexerUrl).toString();
      this.resolvedStatusEndpoint = statusUrl;
      console.log(`Resolved indexer status endpoint: ${statusUrl}`);
      return statusUrl;
    } catch (err) {
      console.error('Failed to resolve indexer status URL:', err);
      return undefined;
    }
  }

  // Expose data for external use (e.g., agent tools)
  get latestAllocations(): Allocation[] | null {
    return this.dataCache?.allocations ?? null;
  }

  get latestNetworkData(): NetworkDataSnapshot | null {
    return this.dataCache?.networkData ?? null;
  }

  get latestDeploymentStatuses(): Map<string, DeploymentStatus> | undefined {
    return this.dataCache?.deploymentStatuses;
  }

  /**
   * Fetch fresh deployment statuses directly from the graph-node status endpoint.
   * Bypasses the cache entirely — used for on-demand queries like fix commands.
   */
  async fetchFreshDeploymentStatuses(hashes: string[]): Promise<Map<string, DeploymentStatus>> {
    const statusEndpoint = await this.resolveStatusEndpoint();
    if (!statusEndpoint) {
      throw new Error('No status endpoint available');
    }
    return this.poller.fetchDeploymentStatuses(statusEndpoint, hashes);
  }
}
