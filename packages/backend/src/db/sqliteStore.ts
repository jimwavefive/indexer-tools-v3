import Database from 'better-sqlite3';
import { readFile, rename } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RuleConfig } from '../services/notifications/rules/Rule.js';
import type { ChannelConfig } from '../services/notifications/channels/Channel.js';
import type { HistoryRecord } from '../services/notifications/NotificationEngine.js';

const DEFAULT_DB_DIR = './data';
const DEFAULT_DB_PATH = `${DEFAULT_DB_DIR}/notifications.db`;
const LEGACY_JSON_PATH = './data/notifications.json';

export interface IncidentRecord {
  id: string;
  rule_id: string;
  target_key: string;
  target_label: string;
  severity: string;
  status: 'open' | 'acknowledged' | 'resolved';
  auto_resolve: number;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
  occurrence_count: number;
  latest_title: string;
  latest_message: string;
  latest_metadata: Record<string, unknown>;
  channel_ids: string[];
}

const DEFAULT_RULES: RuleConfig[] = [
  {
    id: 'allocation-duration',
    name: 'Allocation Duration Warning',
    type: 'allocation_duration',
    enabled: true,
    conditions: { thresholdEpochs: 26 },
  },
  {
    id: 'signal-drop',
    name: 'Signal Drop to Zero',
    type: 'signal_drop',
    enabled: true,
    conditions: {},
  },
  {
    id: 'proportion',
    name: 'Disproportionate Allocation',
    type: 'proportion',
    enabled: true,
    conditions: { threshold: 0.5 },
  },
  {
    id: 'subgraph-upgrade',
    name: 'Subgraph Deployment Upgrade',
    type: 'subgraph_upgrade',
    enabled: true,
    conditions: { maxApr: 0, minGrt: 10000 },
  },
];

export class SqliteStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || process.env.DB_PATH || DEFAULT_DB_PATH;
    const dir = dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        conditions TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        target_key TEXT NOT NULL,
        target_label TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL DEFAULT 'info',
        status TEXT NOT NULL DEFAULT 'open',
        auto_resolve INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        resolved_at TEXT,
        occurrence_count INTEGER NOT NULL DEFAULT 1,
        latest_title TEXT NOT NULL DEFAULT '',
        latest_message TEXT NOT NULL DEFAULT '',
        latest_metadata TEXT NOT NULL DEFAULT '{}',
        channel_ids TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        incident_id TEXT,
        rule_id TEXT,
        title TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL DEFAULT 'info',
        notification_timestamp TEXT NOT NULL,
        channel_ids TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
      CREATE INDEX IF NOT EXISTS idx_incidents_rule_target ON incidents(rule_id, target_key);
      CREATE INDEX IF NOT EXISTS idx_history_incident ON history(incident_id);
      CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at);
    `);

    // Seed default settings if not present
    const seedSetting = this.db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    );
    seedSetting.run(
      'pollingIntervalSeconds',
      process.env.POLLING_INTERVAL_SECONDS || '600',
    );
    seedSetting.run(
      'cooldownMinutes',
      process.env.COOLDOWN_MINUTES || '60',
    );

    // Seed default rules if table is empty
    const ruleCount = this.db.prepare('SELECT COUNT(*) as cnt FROM rules').get() as { cnt: number };
    if (ruleCount.cnt === 0) {
      const insertRule = this.db.prepare(
        'INSERT INTO rules (id, name, type, enabled, conditions) VALUES (?, ?, ?, ?, ?)',
      );
      for (const rule of DEFAULT_RULES) {
        insertRule.run(rule.id, rule.name, rule.type, rule.enabled ? 1 : 0, JSON.stringify(rule.conditions));
      }
      console.log('Seeded default notification rules');
    }
  }

  async migrateFromJson(): Promise<void> {
    const jsonPath = process.env.LEGACY_JSON_PATH || LEGACY_JSON_PATH;
    if (!existsSync(jsonPath)) return;

    try {
      const raw = await readFile(jsonPath, 'utf-8');
      const data = JSON.parse(raw) as {
        rules?: RuleConfig[];
        channels?: ChannelConfig[];
        history?: HistoryRecord[];
      };

      const insertRule = this.db.prepare(
        'INSERT OR REPLACE INTO rules (id, name, type, enabled, conditions) VALUES (?, ?, ?, ?, ?)',
      );
      const insertChannel = this.db.prepare(
        'INSERT OR REPLACE INTO channels (id, name, type, enabled, config) VALUES (?, ?, ?, ?, ?)',
      );
      const insertHistory = this.db.prepare(
        `INSERT OR REPLACE INTO history (id, incident_id, rule_id, title, message, severity, notification_timestamp, channel_ids, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const migrate = this.db.transaction(() => {
        if (data.rules) {
          for (const r of data.rules) {
            insertRule.run(r.id, r.name, r.type, r.enabled ? 1 : 0, JSON.stringify(r.conditions));
          }
        }
        if (data.channels) {
          for (const c of data.channels) {
            insertChannel.run(c.id, c.name, c.type, c.enabled ? 1 : 0, JSON.stringify(c.config));
          }
        }
        if (data.history) {
          for (const h of data.history) {
            insertHistory.run(
              h.id,
              null,
              h.notification?.ruleId || '',
              h.notification?.title || '',
              h.notification?.message || '',
              h.notification?.severity || 'info',
              h.notification?.timestamp || h.timestamp,
              JSON.stringify(h.channelIds || []),
              JSON.stringify(h.notification?.metadata || {}),
              h.timestamp,
            );
          }
        }
      });

      migrate();

      await rename(jsonPath, `${jsonPath}.migrated`);
      console.log(`Migrated ${data.rules?.length || 0} rules, ${data.channels?.length || 0} channels, ${data.history?.length || 0} history records from JSON to SQLite`);
    } catch (err) {
      console.error('Failed to migrate from JSON:', err);
    }
  }

  // --- Rules ---

  async getRules(): Promise<RuleConfig[]> {
    const rows = this.db.prepare('SELECT * FROM rules').all() as Array<{
      id: string; name: string; type: string; enabled: number; conditions: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      enabled: r.enabled === 1,
      conditions: JSON.parse(r.conditions),
    }));
  }

  async saveRules(rules: RuleConfig[]): Promise<void> {
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO rules (id, name, type, enabled, conditions) VALUES (?, ?, ?, ?, ?)',
    );
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM rules').run();
      for (const r of rules) {
        insert.run(r.id, r.name, r.type, r.enabled ? 1 : 0, JSON.stringify(r.conditions));
      }
    });
    tx();
  }

  // --- Channels ---

  async getChannels(): Promise<ChannelConfig[]> {
    const rows = this.db.prepare('SELECT * FROM channels').all() as Array<{
      id: string; name: string; type: string; enabled: number; config: string;
    }>;
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      enabled: c.enabled === 1,
      config: JSON.parse(c.config),
    }));
  }

  async saveChannels(channels: ChannelConfig[]): Promise<void> {
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO channels (id, name, type, enabled, config) VALUES (?, ?, ?, ?, ?)',
    );
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM channels').run();
      for (const c of channels) {
        insert.run(c.id, c.name, c.type, c.enabled ? 1 : 0, JSON.stringify(c.config));
      }
    });
    tx();
  }

  // --- History ---

  async getHistory(): Promise<HistoryRecord[]> {
    const rows = this.db.prepare(
      'SELECT * FROM history ORDER BY created_at DESC',
    ).all() as Array<{
      id: string; incident_id: string | null; rule_id: string; title: string;
      message: string; severity: string; notification_timestamp: string;
      channel_ids: string; metadata: string; created_at: string;
    }>;
    return rows.map((h) => ({
      id: h.id,
      incidentId: h.incident_id || undefined,
      notification: {
        title: h.title,
        message: h.message,
        severity: h.severity as 'info' | 'warning' | 'critical',
        timestamp: h.notification_timestamp,
        ruleId: h.rule_id,
        metadata: JSON.parse(h.metadata),
      },
      channelIds: JSON.parse(h.channel_ids),
      timestamp: h.created_at,
    }));
  }

  async addHistory(record: HistoryRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO history (id, incident_id, rule_id, title, message, severity, notification_timestamp, channel_ids, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      record.id,
      (record as any).incidentId || null,
      record.notification?.ruleId || '',
      record.notification?.title || '',
      record.notification?.message || '',
      record.notification?.severity || 'info',
      record.notification?.timestamp || record.timestamp,
      JSON.stringify(record.channelIds || []),
      JSON.stringify(record.notification?.metadata || {}),
      record.timestamp,
    );
  }

  async clearHistory(): Promise<void> {
    this.db.prepare('DELETE FROM history').run();
  }

  // --- Incidents ---

  getOpenIncident(ruleId: string, targetKey: string): IncidentRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM incidents WHERE rule_id = ? AND target_key = ? AND status = 'open'",
    ).get(ruleId, targetKey) as any;
    if (!row) return null;
    return {
      ...row,
      auto_resolve: row.auto_resolve,
      latest_metadata: JSON.parse(row.latest_metadata),
      channel_ids: JSON.parse(row.channel_ids),
    };
  }

  createIncident(incident: IncidentRecord): void {
    this.db.prepare(
      `INSERT INTO incidents (id, rule_id, target_key, target_label, severity, status, auto_resolve,
        first_seen, last_seen, resolved_at, occurrence_count, latest_title, latest_message, latest_metadata, channel_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      incident.id,
      incident.rule_id,
      incident.target_key,
      incident.target_label,
      incident.severity,
      incident.status,
      incident.auto_resolve,
      incident.first_seen,
      incident.last_seen,
      incident.resolved_at,
      incident.occurrence_count,
      incident.latest_title,
      incident.latest_message,
      JSON.stringify(incident.latest_metadata),
      JSON.stringify(incident.channel_ids),
    );
  }

  updateIncident(id: string, updates: Partial<IncidentRecord>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.last_seen !== undefined) { fields.push('last_seen = ?'); values.push(updates.last_seen); }
    if (updates.occurrence_count !== undefined) { fields.push('occurrence_count = ?'); values.push(updates.occurrence_count); }
    if (updates.latest_title !== undefined) { fields.push('latest_title = ?'); values.push(updates.latest_title); }
    if (updates.latest_message !== undefined) { fields.push('latest_message = ?'); values.push(updates.latest_message); }
    if (updates.latest_metadata !== undefined) { fields.push('latest_metadata = ?'); values.push(JSON.stringify(updates.latest_metadata)); }
    if (updates.channel_ids !== undefined) { fields.push('channel_ids = ?'); values.push(JSON.stringify(updates.channel_ids)); }
    if (updates.severity !== undefined) { fields.push('severity = ?'); values.push(updates.severity); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.resolved_at !== undefined) { fields.push('resolved_at = ?'); values.push(updates.resolved_at); }

    if (fields.length === 0) return;

    values.push(id);
    this.db.prepare(`UPDATE incidents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  getIncidents(options?: { status?: string; limit?: number; offset?: number }): IncidentRecord[] {
    let sql = 'SELECT * FROM incidents';
    const params: unknown[] = [];

    if (options?.status && options.status !== 'all') {
      sql += ' WHERE status = ?';
      params.push(options.status);
    }

    sql += ' ORDER BY last_seen DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
      if (options?.offset) {
        sql += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      ...r,
      latest_metadata: JSON.parse(r.latest_metadata),
      channel_ids: JSON.parse(r.channel_ids),
    }));
  }

  getIncidentById(id: string): (IncidentRecord & { history: HistoryRecord[] }) | null {
    const row = this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as any;
    if (!row) return null;

    const incident: IncidentRecord = {
      ...row,
      latest_metadata: JSON.parse(row.latest_metadata),
      channel_ids: JSON.parse(row.channel_ids),
    };

    const historyRows = this.db.prepare(
      'SELECT * FROM history WHERE incident_id = ? ORDER BY created_at DESC',
    ).all(id) as any[];

    const history = historyRows.map((h: any) => ({
      id: h.id,
      incidentId: h.incident_id || undefined,
      notification: {
        title: h.title,
        message: h.message,
        severity: h.severity as 'info' | 'warning' | 'critical',
        timestamp: h.notification_timestamp,
        ruleId: h.rule_id,
        metadata: JSON.parse(h.metadata),
      },
      channelIds: JSON.parse(h.channel_ids),
      timestamp: h.created_at,
    }));

    return { ...incident, history };
  }

  /**
   * Auto-resolve open incidents whose rule_id:target_key was NOT fired this cycle.
   * Only resolves incidents with auto_resolve=1.
   */
  autoResolveIncidents(firedKeys: Set<string>): number {
    const openIncidents = this.db.prepare(
      "SELECT id, rule_id, target_key FROM incidents WHERE status = 'open' AND auto_resolve = 1",
    ).all() as Array<{ id: string; rule_id: string; target_key: string }>;

    const now = new Date().toISOString();
    let resolved = 0;

    const update = this.db.prepare(
      "UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE id = ?",
    );

    for (const inc of openIncidents) {
      const key = `${inc.rule_id}:${inc.target_key}`;
      if (!firedKeys.has(key)) {
        update.run(now, inc.id);
        resolved++;
      }
    }

    return resolved;
  }

  // --- Settings ---

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  getSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }
}
