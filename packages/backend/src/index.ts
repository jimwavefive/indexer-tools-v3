import express from 'express';
import cors from 'cors';
import healthRoutes from './api/routes/health.js';
import { createNotificationRoutes } from './api/routes/notifications.js';
import agentRouter from './api/routes/agent.js';
import { JsonStore } from './db/jsonStore.js';
import { PollingScheduler } from './services/poller/scheduler.js';

const app = express();
const port = parseInt(process.env.PORT || '4000', 10);

app.use(cors());
app.use(express.json());

// Shared store instance
const store = new JsonStore();

// Routes
app.use(healthRoutes);
app.use(createNotificationRoutes(store));
app.use('/api/agent', agentRouter);

// Start notification polling if enabled
if (process.env.FEATURE_NOTIFICATIONS_ENABLED === 'true') {
  const indexerAddress = process.env.INDEXER_ADDRESS;

  if (!indexerAddress) {
    console.error(
      'FEATURE_NOTIFICATIONS_ENABLED is true but INDEXER_ADDRESS is not set. Notifications will not start.',
    );
  } else {
    const pollingIntervalSeconds = parseInt(
      process.env.POLLING_INTERVAL_SECONDS || '300',
      10,
    );

    const scheduler = new PollingScheduler({
      store,
      indexerAddress,
      pollingIntervalSeconds,
    });

    scheduler.start();

    // Graceful shutdown
    const shutdown = () => {
      console.log('Shutting down polling scheduler...');
      scheduler.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

app.listen(port, () => {
  console.log(`Indexer Tools Backend running on port ${port}`);
});
