import express from 'express';
import cors from 'cors';
import healthRoutes from './api/routes/health.js';
import { createNotificationRoutes } from './api/routes/notifications.js';
import agentRouter from './api/routes/agent.js';
import { SqliteStore } from './db/sqliteStore.js';
import { PollingScheduler } from './services/poller/scheduler.js';
import type { ChannelConfig } from './services/notifications/channels/Channel.js';

/**
 * Parse NOTIFICATION_CHANNEL_N_* env vars into ChannelConfig objects.
 * Follows the numbered pattern used elsewhere (CHAIN_0_NAME, CHAIN_1_NAME, etc.).
 */
function parseChannelsFromEnv(): ChannelConfig[] {
  const channels: ChannelConfig[] = [];

  for (let i = 0; ; i++) {
    const prefix = `NOTIFICATION_CHANNEL_${i}_`;
    const name = process.env[`${prefix}NAME`];
    const type = process.env[`${prefix}TYPE`];

    // Stop scanning when we hit a gap
    if (!name || !type) break;

    const enabled = process.env[`${prefix}ENABLED`] !== 'false';

    // Build type-specific config
    const config: Record<string, unknown> = {};
    if (type === 'discord') {
      const webhookUrl = process.env[`${prefix}WEBHOOK_URL`];
      if (!webhookUrl) {
        console.warn(`NOTIFICATION_CHANNEL_${i}: discord type requires WEBHOOK_URL, skipping`);
        continue;
      }
      config.webhookUrl = webhookUrl;
    }

    channels.push({
      id: `env-channel-${i}`,
      name,
      type,
      enabled,
      config,
    });
  }

  return channels;
}

/**
 * Sync env-defined channels into the store. Env vars are the source of truth
 * for env-channel-* entries — they are created or updated to match.
 * Channels created via the API (non env-channel-* IDs) are left untouched.
 */
async function syncEnvChannels(store: SqliteStore): Promise<void> {
  const envChannels = parseChannelsFromEnv();
  if (envChannels.length === 0) return;

  const existing = await store.getChannels();
  const envIds = new Set(envChannels.map((c) => c.id));

  // Keep API-created channels, replace all env-channel-* entries with fresh env values
  const apiChannels = existing.filter((c) => !envIds.has(c.id) && !c.id.startsWith('env-channel-'));
  const merged = [...apiChannels, ...envChannels];

  await store.saveChannels(merged);

  for (const ch of envChannels) {
    const existed = existing.some((e) => e.id === ch.id);
    console.log(
      `Notification channel "${ch.name}" (${ch.type}, ${ch.enabled ? 'enabled' : 'disabled'}) ${existed ? 'updated' : 'created'} from env`,
    );
  }
}

const app = express();
const port = parseInt(process.env.PORT || '4000', 10);

app.use(cors());
app.use(express.json());

// Shared store instance
const store = new SqliteStore();

// Migrate from JSON if legacy file exists
await store.migrateFromJson();

// Sync env-defined notification channels into the store
await syncEnvChannels(store);

// Start notification polling if enabled
let scheduler: PollingScheduler | undefined;

if (process.env.FEATURE_NOTIFICATIONS_ENABLED === 'true') {
  const indexerAddress = process.env.INDEXER_ADDRESS;

  if (!indexerAddress) {
    console.error(
      'FEATURE_NOTIFICATIONS_ENABLED is true but INDEXER_ADDRESS is not set. Notifications will not start.',
    );
  } else {
    const pollingIntervalSeconds = parseInt(
      store.getSetting('pollingIntervalSeconds') || process.env.POLLING_INTERVAL_SECONDS || '600',
      10,
    );

    scheduler = new PollingScheduler({
      store,
      indexerAddress,
      pollingIntervalSeconds,
    });

    scheduler.start();

    // Graceful shutdown
    const shutdown = () => {
      console.log('Shutting down polling scheduler...');
      scheduler!.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

// Routes
app.use(healthRoutes);
app.use(createNotificationRoutes(store, scheduler));
app.use('/api/agent', agentRouter);

app.listen(port, () => {
  console.log(`Indexer Tools Backend running on port ${port}`);
});
