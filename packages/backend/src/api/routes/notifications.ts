import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { JsonStore } from '../../db/jsonStore.js';
import type { RuleConfig } from '../../services/notifications/rules/Rule.js';
import type { ChannelConfig } from '../../services/notifications/channels/Channel.js';

export function createNotificationRoutes(store: JsonStore): Router {
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
      res.json(channels);
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

      channels[index] = {
        ...channels[index],
        ...body,
        id, // Prevent ID changes
      };

      await store.saveChannels(channels);
      res.json(channels[index]);
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

      const embed = {
        title: 'Indexer Tools — Test Notification',
        description: 'This is a test notification from Indexer Tools.',
        color: 0x00aaff,
        timestamp: new Date().toISOString(),
        footer: { text: 'Test notification' },
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });

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

  return router;
}
