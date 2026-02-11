import { Router } from 'express';
import type { SqliteStore } from '../../db/sqliteStore.js';

export function createBlacklistRoutes(store: SqliteStore): Router {
  const router = Router();

  // GET /api/blacklist — list all entries
  router.get('/api/blacklist', (_req, res) => {
    try {
      const entries = store.getBlacklistEntries();
      res.json({ entries });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch blacklist' });
    }
  });

  // POST /api/blacklist — add entry
  router.post('/api/blacklist', (req, res) => {
    const { ipfsHash } = req.body;
    if (!ipfsHash || typeof ipfsHash !== 'string') {
      res.status(400).json({ error: 'ipfsHash is required' });
      return;
    }
    try {
      store.addBlacklistEntry(ipfsHash.trim());
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add blacklist entry' });
    }
  });

  // DELETE /api/blacklist/:hash — remove entry
  router.delete('/api/blacklist/:hash', (req, res) => {
    const { hash } = req.params;
    try {
      store.removeBlacklistEntry(hash);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to remove blacklist entry' });
    }
  });

  return router;
}
