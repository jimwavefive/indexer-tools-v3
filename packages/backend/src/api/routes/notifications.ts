import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqliteStore } from '../../db/sqliteStore.js';
import type { RuleConfig } from '../../services/notifications/rules/Rule.js';
import type { ChannelConfig } from '../../services/notifications/channels/Channel.js';
import type { PollingScheduler } from '../../services/poller/scheduler.js';

/** Validate that a webhook URL is safe to fetch (SSRF protection). */
function isAllowedWebhookUrl(urlStr: string): { ok: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTPS URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = ['discord.com', 'discordapp.com'];
  if (!allowedHosts.some((h) => hostname === h || hostname.endsWith('.' + h))) {
    return { ok: false, reason: 'Only Discord webhook URLs are allowed' };
  }

  return { ok: true };
}

export function createNotificationRoutes(store: SqliteStore, scheduler?: PollingScheduler): Router {
  const router = Router();

  // --- Rules ---

  router.get('/api/notifications/rules', async (_req: Request, res: Response) => {
    try {
      const rules = await store.getRules();
      res.json(rules);
    } catch (err) {
      console.error('Failed to get rules:', err);
      res.status(500).json({ error: 'Failed to get rules' });
    }
  });

  router.post('/api/notifications/rules', async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<RuleConfig>;
      if (!body.name || !body.type) {
        res.status(400).json({ error: 'name and type are required' });
        return;
      }

      const newRule: RuleConfig = {
        id: body.id || uuidv4(),
        name: body.name,
        type: body.type,
        enabled: body.enabled ?? true,
        conditions: body.conditions ?? {},
      };

      const rules = await store.getRules();
      rules.push(newRule);
      await store.saveRules(rules);

      res.status(201).json(newRule);
    } catch (err) {
      console.error('Failed to create rule:', err);
      res.status(500).json({ error: 'Failed to create rule' });
    }
  });

  router.put('/api/notifications/rules/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body as Partial<RuleConfig>;
      const rules = await store.getRules();
      const index = rules.findIndex((r) => r.id === id);

      if (index === -1) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      rules[index] = {
        ...rules[index],
        ...body,
        id, // Prevent ID changes
      };

      await store.saveRules(rules);
      res.json(rules[index]);
    } catch (err) {
      console.error('Failed to update rule:', err);
      res.status(500).json({ error: 'Failed to update rule' });
    }
  });

  router.delete('/api/notifications/rules/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rules = await store.getRules();
      const filtered = rules.filter((r) => r.id !== id);

      if (filtered.length === rules.length) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      await store.saveRules(filtered);
      res.status(204).send();
    } catch (err) {
      console.error('Failed to delete rule:', err);
      res.status(500).json({ error: 'Failed to delete rule' });
    }
  });

  // --- Channels ---

  router.get('/api/notifications/channels', async (_req: Request, res: Response) => {
    try {
      const channels = await store.getChannels();
      // Mask sensitive config values in the response
      const masked = channels.map((ch) => ({
        ...ch,
        config: {
          ...ch.config,
          ...(ch.config?.webhookUrl
            ? { webhookUrl: '••••••••' + (ch.config.webhookUrl as string).slice(-8) }
            : {}),
        },
      }));
      res.json(masked);
    } catch (err) {
      console.error('Failed to get channels:', err);
      res.status(500).json({ error: 'Failed to get channels' });
    }
  });

  router.post('/api/notifications/channels', async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<ChannelConfig>;
      if (!body.name || !body.type) {
        res.status(400).json({ error: 'name and type are required' });
        return;
      }

      const newChannel: ChannelConfig = {
        id: body.id || uuidv4(),
        name: body.name,
        type: body.type,
        enabled: body.enabled ?? true,
        config: body.config ?? {},
      };

      const channels = await store.getChannels();
      channels.push(newChannel);
      await store.saveChannels(channels);

      res.status(201).json(newChannel);
    } catch (err) {
      console.error('Failed to create channel:', err);
      res.status(500).json({ error: 'Failed to create channel' });
    }
  });

  router.put('/api/notifications/channels/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body as Partial<ChannelConfig>;
      const channels = await store.getChannels();
      const index = channels.findIndex((c) => c.id === id);

      if (index === -1) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      // If no config provided, preserve existing config (supports masked webhook editing)
      const updatedConfig = body.config ?? channels[index].config;
      channels[index] = {
        ...channels[index],
        ...body,
        id, // Prevent ID changes
        config: updatedConfig,
      };

      await store.saveChannels(channels);
      // Mask sensitive config in response
      const responseChannel = {
        ...channels[index],
        config: {
          ...channels[index].config,
          ...(channels[index].config?.webhookUrl
            ? { webhookUrl: '••••••••' + (channels[index].config.webhookUrl as string).slice(-8) }
            : {}),
        },
      };
      res.json(responseChannel);
    } catch (err) {
      console.error('Failed to update channel:', err);
      res.status(500).json({ error: 'Failed to update channel' });
    }
  });

  router.delete('/api/notifications/channels/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const channels = await store.getChannels();
      const filtered = channels.filter((c) => c.id !== id);

      if (filtered.length === channels.length) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      await store.saveChannels(filtered);
      res.status(204).send();
    } catch (err) {
      console.error('Failed to delete channel:', err);
      res.status(500).json({ error: 'Failed to delete channel' });
    }
  });

  // --- Channel Test ---

  router.post('/api/notifications/channels/test', async (req: Request, res: Response) => {
    try {
      const { webhookUrl } = req.body as { webhookUrl?: string };
      if (!webhookUrl) {
        res.status(400).json({ error: 'webhookUrl is required' });
        return;
      }

      const urlCheck = isAllowedWebhookUrl(webhookUrl);
      if (!urlCheck.ok) {
        res.status(400).json({ error: `Invalid webhook URL: ${urlCheck.reason}` });
        return;
      }

      const embed = {
        title: 'Indexer Tools — Test Notification',
        description: 'This is a test notification from Indexer Tools.',
        color: 0x00aaff,
        timestamp: new Date().toISOString(),
        footer: { text: 'Test notification' },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => 'unknown error');
        res.status(502).json({ error: `Discord webhook failed (${response.status}): ${text}` });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Failed to test channel:', err);
      res.status(500).json({ error: 'Failed to test channel' });
    }
  });

  // --- History ---

  router.get('/api/notifications/history', async (_req: Request, res: Response) => {
    try {
      const history = await store.getHistory();
      res.json(history);
    } catch (err) {
      console.error('Failed to get history:', err);
      res.status(500).json({ error: 'Failed to get history' });
    }
  });

  router.delete('/api/notifications/history', async (_req: Request, res: Response) => {
    try {
      await store.clearHistory();
      res.status(204).send();
    } catch (err) {
      console.error('Failed to clear history:', err);
      res.status(500).json({ error: 'Failed to clear history' });
    }
  });

  // --- Incidents ---

  router.get('/api/notifications/incidents', async (req: Request, res: Response) => {
    try {
      const status = (req.query.status as string) || 'open';
      const limit = parseInt((req.query.limit as string) || '100', 10);
      const offset = parseInt((req.query.offset as string) || '0', 10);
      const incidents = store.getIncidents({ status, limit, offset });
      res.json(incidents);
    } catch (err) {
      console.error('Failed to get incidents:', err);
      res.status(500).json({ error: 'Failed to get incidents' });
    }
  });

  router.get('/api/notifications/incidents/:id', async (req: Request, res: Response) => {
    try {
      const incident = store.getIncidentById(req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }
      res.json(incident);
    } catch (err) {
      console.error('Failed to get incident:', err);
      res.status(500).json({ error: 'Failed to get incident' });
    }
  });

  router.put('/api/notifications/incidents/:id/acknowledge', async (req: Request, res: Response) => {
    try {
      const incident = store.getIncidentById(req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }
      store.updateIncident(req.params.id, { status: 'acknowledged' });
      res.json({ ...incident, status: 'acknowledged' });
    } catch (err) {
      console.error('Failed to acknowledge incident:', err);
      res.status(500).json({ error: 'Failed to acknowledge incident' });
    }
  });

  router.put('/api/notifications/incidents/:id/resolve', async (req: Request, res: Response) => {
    try {
      const incident = store.getIncidentById(req.params.id);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }
      store.updateIncident(req.params.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      });
      res.json({ ...incident, status: 'resolved', resolved_at: new Date().toISOString() });
    } catch (err) {
      console.error('Failed to resolve incident:', err);
      res.status(500).json({ error: 'Failed to resolve incident' });
    }
  });

  // --- Settings ---

  router.get('/api/notifications/settings', async (_req: Request, res: Response) => {
    try {
      const settings = store.getSettings();
      res.json({
        pollingIntervalSeconds: parseInt(settings.pollingIntervalSeconds || '600', 10),
        cooldownMinutes: parseInt(settings.cooldownMinutes || '60', 10),
      });
    } catch (err) {
      console.error('Failed to get settings:', err);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  router.put('/api/notifications/settings', async (req: Request, res: Response) => {
    try {
      const { pollingIntervalSeconds, cooldownMinutes } = req.body as {
        pollingIntervalSeconds?: number;
        cooldownMinutes?: number;
      };

      if (pollingIntervalSeconds !== undefined) {
        const clamped = Math.max(60, Math.min(3600, pollingIntervalSeconds));
        store.setSetting('pollingIntervalSeconds', String(clamped));

        if (scheduler) {
          scheduler.updateInterval(clamped);
        }
      }

      if (cooldownMinutes !== undefined) {
        const clamped = Math.max(5, Math.min(1440, cooldownMinutes));
        store.setSetting('cooldownMinutes', String(clamped));
      }

      const settings = store.getSettings();
      res.json({
        pollingIntervalSeconds: parseInt(settings.pollingIntervalSeconds || '600', 10),
        cooldownMinutes: parseInt(settings.cooldownMinutes || '60', 10),
      });
    } catch (err) {
      console.error('Failed to update settings:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}
