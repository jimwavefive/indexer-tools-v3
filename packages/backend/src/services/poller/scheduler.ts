import { NetworkPoller } from './NetworkPoller.js';
import { NotificationEngine, type HistoryRecord } from '../notifications/NotificationEngine.js';
import { SqliteStore } from '../../db/sqliteStore.js';
import type { Allocation } from '@indexer-tools/shared';
import type { NetworkDataSnapshot, DeploymentStatus } from '../notifications/rules/Rule.js';
import type { Channel } from '../notifications/channels/Channel.js';

const DEFAULT_POLLING_INTERVAL_SECONDS = 600; // 10 minutes

export class PollingScheduler {
  private poller: NetworkPoller;
  private engine: NotificationEngine;
  private store: SqliteStore;
  private indexerAddress: string;
  private indexerStatusEndpointOverride?: string;
  private resolvedStatusEndpoint?: string;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private latestAllocations: Allocation[] | null = null;
  private latestNetworkData: NetworkDataSnapshot | null = null;
  private latestDeploymentStatuses: Map<string, DeploymentStatus> | undefined;

  constructor(options: {
    store: SqliteStore;
    indexerAddress: string;
    pollingIntervalSeconds?: number;
    indexerStatusEndpoint?: string;
  }) {
    this.poller = new NetworkPoller();
    this.store = options.store;
    this.indexerAddress = options.indexerAddress;
    this.indexerStatusEndpointOverride = options.indexerStatusEndpoint;
    this.intervalMs =
      (options.pollingIntervalSeconds ?? DEFAULT_POLLING_INTERVAL_SECONDS) * 1000;

    this.engine = new NotificationEngine({
      store: this.store,
      onHistoryRecord: (record) => {
        this.store.addHistory(record).catch((err) => {
          console.error('Failed to persist history record:', err);
        });
      },
    });
  }

  start(): void {
    if (this.timer) {
      console.warn('PollingScheduler is already running');
      return;
    }

    console.log(
      `PollingScheduler started: polling every ${this.intervalMs / 1000}s for indexer ${this.indexerAddress}`,
    );

    // Run immediately on start, then on interval
    this.poll().catch((err) => console.error('Initial poll failed:', err));

    this.timer = setInterval(() => {
      this.poll().catch((err) => console.error('Scheduled poll failed:', err));
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('PollingScheduler stopped');
    }
  }

  updateInterval(newIntervalSeconds: number): void {
    this.intervalMs = newIntervalSeconds * 1000;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.poll().catch((err) => console.error('Scheduled poll failed:', err));
      }, this.intervalMs);
      console.log(`PollingScheduler interval updated to ${newIntervalSeconds}s`);
    }
  }

  async poll(): Promise<void> {
    if (this.polling) {
      console.log('Poll already in progress, skipping');
      return;
    }

    this.polling = true;
    const startTime = Date.now();

    try {
      console.log('Polling network data...');

      const [allocations, networkData] = await Promise.all([
        this.poller.fetchAllocations(this.indexerAddress),
        this.poller.fetchNetworkData(),
      ]);

      console.log(
        `Fetched ${allocations.length} allocations, epoch ${networkData.currentEpoch}`,
      );

      // Fetch deployment statuses from the indexer's status endpoint
      let deploymentStatuses: Map<string, DeploymentStatus> | undefined;
      const statusEndpoint = await this.resolveStatusEndpoint();
      if (statusEndpoint) {
        try {
          // Only query for deployments we have allocations on
          const deploymentHashes = [...new Set(allocations.map((a) => a.subgraphDeployment.ipfsHash))];
          deploymentStatuses = await this.poller.fetchDeploymentStatuses(statusEndpoint, deploymentHashes);
          console.log(`Fetched ${deploymentStatuses.size} deployment statuses from ${statusEndpoint}`);
        } catch (err) {
          console.error('Failed to fetch deployment statuses:', err);
          // Clear cached endpoint so it re-resolves next cycle
          if (!this.indexerStatusEndpointOverride) {
            this.resolvedStatusEndpoint = undefined;
          }
        }
      }

      // Cache latest data for testRule()
      this.latestAllocations = allocations;
      this.latestNetworkData = networkData;
      this.latestDeploymentStatuses = deploymentStatuses;

      const rules = await this.store.getRules();
      const channels = await this.store.getChannels();

      const records = await this.engine.evaluate(allocations, networkData, rules, channels, deploymentStatuses);

      const elapsed = Date.now() - startTime;
      if (records.length > 0) {
        console.log(
          `Poll complete in ${elapsed}ms: ${records.length} notification(s) triggered`,
        );
      } else {
        console.log(`Poll complete in ${elapsed}ms: no notifications triggered`);
      }
    } catch (err) {
      console.error('Poll error:', err);
    } finally {
      this.polling = false;
    }
  }

  async testRule(ruleId: string): Promise<{
    triggered: boolean;
    notificationCount: number;
    sent: boolean;
    filterSummary?: string;
    error?: string;
    status?: number;
  }> {
    if (!this.latestAllocations || !this.latestNetworkData) {
      return { triggered: false, notificationCount: 0, sent: false, error: 'No poll data yet — wait for the first poll to complete', status: 503 };
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
      allocations: this.latestAllocations,
      networkData: this.latestNetworkData,
      previousState: this.engine.currentPreviousState,
      deploymentStatuses: this.latestDeploymentStatuses,
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
    // Env var override takes priority
    if (this.indexerStatusEndpointOverride) {
      return this.indexerStatusEndpointOverride;
    }

    // Use cached resolution if available
    if (this.resolvedStatusEndpoint) {
      return this.resolvedStatusEndpoint;
    }

    // Dynamically resolve from the indexer's on-chain registered URL
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
}
