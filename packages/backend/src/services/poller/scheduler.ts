import { NetworkPoller } from './NetworkPoller.js';
import { NotificationEngine } from '../notifications/NotificationEngine.js';
import { JsonStore } from '../../db/jsonStore.js';

const DEFAULT_POLLING_INTERVAL_SECONDS = 300; // 5 minutes

export class PollingScheduler {
  private poller: NetworkPoller;
  private engine: NotificationEngine;
  private store: JsonStore;
  private indexerAddress: string;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(options: {
    store: JsonStore;
    indexerAddress: string;
    pollingIntervalSeconds?: number;
  }) {
    this.poller = new NetworkPoller();
    this.store = options.store;
    this.indexerAddress = options.indexerAddress;
    this.intervalMs =
      (options.pollingIntervalSeconds ?? DEFAULT_POLLING_INTERVAL_SECONDS) * 1000;

    this.engine = new NotificationEngine({
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

      const rules = await this.store.getRules();
      const channels = await this.store.getChannels();

      const records = await this.engine.evaluate(allocations, networkData, rules, channels);

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
}
