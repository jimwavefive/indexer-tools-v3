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
  last_notified_at: string | null;
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
    conditions: { thresholdEpochs: 26, allowedActions: ['acknowledge', 'resolve'] },
  },
  {
    id: 'signal-drop',
    name: 'Signal Drop to Zero',
    type: 'signal_drop',
    enabled: true,
    conditions: { allowedActions: ['acknowledge', 'resolve'] },
  },
  {
    id: 'proportion',
    name: 'Disproportionate Allocation',
    type: 'proportion',
    enabled: true,
    conditions: { threshold: 0.5, allowedActions: ['acknowledge', 'resolve'] },
  },
  {
    id: 'subgraph-upgrade',
    name: 'Subgraph Deployment Upgrade',
    type: 'subgraph_upgrade',
    enabled: true,
    conditions: { maxApr: 10, minGrt: 10000, allowedActions: ['acknowledge', 'resolve'] },
  },
  {
    id: 'failed-subgraph',
    name: 'Failed Subgraph Allocated',
    type: 'failed_subgraph',
    enabled: true,
    conditions: { minGrt: 10000, allowedActions: [] },
  },
  {
    id: 'behind-chainhead',
    name: 'Behind Chainhead Allocated',
    type: 'behind_chainhead',
    enabled: true,
    conditions: { blocksBehindThreshold: 5000, allowedActions: [] },
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

    // Migration: add last_notified_at column to incidents
    try {
      this.db.exec('ALTER TABLE incidents ADD COLUMN last_notified_at TEXT');
      console.log('Migration: added last_notified_at column to incidents');
    } catch {
      // Column already exists — ignore
    }

    // Migration: add is_test column to history
    try {
      this.db.exec('ALTER TABLE history ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0');
      console.log('Migration: added is_test column to history');
    } catch {
      // Column already exists — ignore
    }

    // Migration: add cooldown_minutes column to rules (per-rule cooldown override)
    try {
      this.db.exec('ALTER TABLE rules ADD COLUMN cooldown_minutes INTEGER');
      console.log('Migration: added cooldown_minutes column to rules');
    } catch {
      // Column already exists — ignore
    }

    // Migration: add polling_interval_seconds column to rules (per-rule polling override)
    // Kept for backwards compatibility — new code uses polling_interval_minutes instead
    try {
      this.db.exec('ALTER TABLE rules ADD COLUMN polling_interval_seconds INTEGER');
    } catch {
      // Column already exists — ignore
    }

    // Migration: add polling_interval_minutes column to rules (replaces polling_interval_seconds)
    try {
      this.db.exec('ALTER TABLE rules ADD COLUMN polling_interval_minutes INTEGER');
      // Migrate any existing per-rule overrides (seconds → minutes)
      this.db.exec('UPDATE rules SET polling_interval_minutes = polling_interval_seconds / 60 WHERE polling_interval_seconds IS NOT NULL AND polling_interval_minutes IS NULL');
      console.log('Migration: added polling_interval_minutes column to rules');
    } catch {
      // Column already exists — ignore
    }

    // Migration: add last_polled_at column to rules (for per-rule polling)
    try {
      this.db.exec('ALTER TABLE rules ADD COLUMN last_polled_at TEXT');
      console.log('Migration: added last_polled_at column to rules');
    } catch {
      // Column already exists — ignore
    }

    // Agent infrastructure tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        incident_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_call_id TEXT,
        tool_name TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agent_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        incident_id TEXT,
        action_type TEXT NOT NULL,
        tool_name TEXT,
        tool_args TEXT,
        result TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_approvals (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        incident_id TEXT,
        action_type TEXT NOT NULL,
        action_args TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        approved_at TEXT,
        executed_at TEXT,
        result TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_incident ON conversations(incident_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv ON conversation_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_agent_audit_incident ON agent_audit_log(incident_id);
      CREATE INDEX IF NOT EXISTS idx_agent_approvals_conv ON agent_approvals(conversation_id);
    `);

    // Seed default settings if not present
    const seedSetting = this.db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    );
    seedSetting.run(
      'pollingIntervalMinutes',
      process.env.POLLING_INTERVAL_MINUTES || '60',
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
    } else {
      // Add any new default rules to existing databases (INSERT OR IGNORE preserves existing)
      const insertNewRule = this.db.prepare(
        'INSERT OR IGNORE INTO rules (id, name, type, enabled, conditions) VALUES (?, ?, ?, ?, ?)',
      );
      for (const rule of DEFAULT_RULES) {
        insertNewRule.run(rule.id, rule.name, rule.type, rule.enabled ? 1 : 0, JSON.stringify(rule.conditions));
      }
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
      polling_interval_minutes: number | null;
      last_polled_at: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      enabled: r.enabled === 1,
      conditions: JSON.parse(r.conditions),
      pollingIntervalMinutes: r.polling_interval_minutes,
      lastPolledAt: r.last_polled_at,
    }));
  }

  async saveRules(rules: RuleConfig[]): Promise<void> {
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO rules (id, name, type, enabled, conditions, polling_interval_minutes, last_polled_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM rules').run();
      for (const r of rules) {
        insert.run(
          r.id,
          r.name,
          r.type,
          r.enabled ? 1 : 0,
          JSON.stringify(r.conditions),
          r.pollingIntervalMinutes ?? null,
          r.lastPolledAt ?? null,
        );
      }
    });
    tx();
  }

  updateRuleLastPolledAt(ruleId: string, timestamp: string): void {
    this.db.prepare('UPDATE rules SET last_polled_at = ? WHERE id = ?').run(timestamp, ruleId);
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
      channel_ids: string; metadata: string; created_at: string; is_test: number;
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
      isTest: h.is_test === 1,
    }));
  }

  async addHistory(record: HistoryRecord): Promise<void> {
    this.db.prepare(
      `INSERT INTO history (id, incident_id, rule_id, title, message, severity, notification_timestamp, channel_ids, metadata, created_at, is_test)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      record.isTest ? 1 : 0,
    );
  }

  async clearHistory(): Promise<void> {
    this.db.prepare('DELETE FROM history').run();
  }

  // --- Incidents ---

  getActiveIncident(ruleId: string, targetKey: string): IncidentRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM incidents WHERE rule_id = ? AND target_key = ? AND status IN ('open', 'acknowledged')",
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
        first_seen, last_seen, last_notified_at, resolved_at, occurrence_count, latest_title, latest_message, latest_metadata, channel_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      incident.last_notified_at || incident.first_seen,
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
    if (updates.last_notified_at !== undefined) { fields.push('last_notified_at = ?'); values.push(updates.last_notified_at); }
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
   * If enabledRuleIds is provided, only considers incidents for those rules —
   * incidents from disabled rules are left untouched.
   */
  autoResolveIncidents(firedKeys: Set<string>, enabledRuleIds?: Set<string>): number {
    const openIncidents = this.db.prepare(
      "SELECT id, rule_id, target_key FROM incidents WHERE status IN ('open', 'acknowledged') AND auto_resolve = 1",
    ).all() as Array<{ id: string; rule_id: string; target_key: string }>;

    const now = new Date().toISOString();
    let resolved = 0;

    const update = this.db.prepare(
      "UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE id = ?",
    );

    for (const inc of openIncidents) {
      // Skip incidents for rules that weren't evaluated (disabled)
      if (enabledRuleIds && !enabledRuleIds.has(inc.rule_id)) continue;

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

  // --- Agent Conversations ---

  createConversation(id: string, incidentId?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO conversations (id, incident_id, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?)',
    ).run(id, incidentId || null, now, now, 'active');
  }

  getConversation(id: string): { id: string; incident_id: string | null; created_at: string; updated_at: string; status: string } | null {
    return this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;
  }

  getConversationByIncident(incidentId: string): { id: string; incident_id: string | null; created_at: string; updated_at: string; status: string } | null {
    return this.db.prepare("SELECT * FROM conversations WHERE incident_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(incidentId) as any;
  }

  updateConversationStatus(id: string, status: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE conversations SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
  }

  appendConversationMessage(conversationId: string, message: {
    role: string;
    content: string;
    tool_call_id?: string;
    tool_name?: string;
  }): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO conversation_messages (conversation_id, role, content, tool_call_id, tool_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(conversationId, message.role, message.content, message.tool_call_id || null, message.tool_name || null, now);

    // Update conversation timestamp
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
  }

  getConversationMessages(conversationId: string): Array<{
    id: number;
    role: string;
    content: string;
    tool_call_id: string | null;
    tool_name: string | null;
    created_at: string;
  }> {
    return this.db.prepare(
      'SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC',
    ).all(conversationId) as any[];
  }

  listConversations(options?: { incidentId?: string; status?: string; limit?: number }): Array<{
    id: string;
    incident_id: string | null;
    created_at: string;
    updated_at: string;
    status: string;
    message_count: number;
  }> {
    let sql = `
      SELECT c.*, COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN conversation_messages m ON m.conversation_id = c.id
    `;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.incidentId) {
      conditions.push('c.incident_id = ?');
      params.push(options.incidentId);
    }
    if (options?.status) {
      conditions.push('c.status = ?');
      params.push(options.status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' GROUP BY c.id ORDER BY c.updated_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.db.prepare(sql).all(...params) as any[];
  }

  // --- Agent Audit Log ---

  logAgentAction(entry: {
    conversation_id?: string;
    incident_id?: string;
    action_type: string;
    tool_name?: string;
    tool_args?: string;
    result?: string;
  }): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO agent_audit_log (conversation_id, incident_id, action_type, tool_name, tool_args, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      entry.conversation_id || null,
      entry.incident_id || null,
      entry.action_type,
      entry.tool_name || null,
      entry.tool_args || null,
      entry.result || null,
      now,
    );
  }

  getAgentAuditLog(options?: { incidentId?: string; conversationId?: string; limit?: number }): Array<{
    id: number;
    conversation_id: string | null;
    incident_id: string | null;
    action_type: string;
    tool_name: string | null;
    tool_args: string | null;
    result: string | null;
    created_at: string;
  }> {
    let sql = 'SELECT * FROM agent_audit_log';
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.incidentId) {
      conditions.push('incident_id = ?');
      params.push(options.incidentId);
    }
    if (options?.conversationId) {
      conditions.push('conversation_id = ?');
      params.push(options.conversationId);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.db.prepare(sql).all(...params) as any[];
  }

  // --- Agent Approvals ---

  createApproval(approval: {
    id: string;
    conversation_id: string;
    incident_id?: string;
    action_type: string;
    action_args: Record<string, unknown>;
  }): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO agent_approvals (id, conversation_id, incident_id, action_type, action_args, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      approval.id,
      approval.conversation_id,
      approval.incident_id || null,
      approval.action_type,
      JSON.stringify(approval.action_args),
      'pending',
      now,
    );
  }

  getApproval(id: string): {
    id: string;
    conversation_id: string;
    incident_id: string | null;
    action_type: string;
    action_args: Record<string, unknown>;
    status: string;
    created_at: string;
    approved_at: string | null;
    executed_at: string | null;
    result: string | null;
  } | null {
    const row = this.db.prepare('SELECT * FROM agent_approvals WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...row, action_args: JSON.parse(row.action_args) };
  }

  getPendingApproval(conversationId: string): {
    id: string;
    conversation_id: string;
    incident_id: string | null;
    action_type: string;
    action_args: Record<string, unknown>;
    status: string;
    created_at: string;
    approved_at: string | null;
    executed_at: string | null;
    result: string | null;
  } | null {
    const row = this.db.prepare(
      "SELECT * FROM agent_approvals WHERE conversation_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    ).get(conversationId) as any;
    if (!row) return null;
    return { ...row, action_args: JSON.parse(row.action_args) };
  }

  approveApproval(id: string): boolean {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      "UPDATE agent_approvals SET status = 'approved', approved_at = ? WHERE id = ? AND status = 'pending'",
    ).run(now, id);
    return result.changes > 0;
  }

  rejectApproval(id: string): boolean {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      "UPDATE agent_approvals SET status = 'rejected', approved_at = ? WHERE id = ? AND status = 'pending'",
    ).run(now, id);
    return result.changes > 0;
  }

  markApprovalExecuted(id: string, result: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      "UPDATE agent_approvals SET status = 'executed', executed_at = ?, result = ? WHERE id = ?",
    ).run(now, result, id);
  }
}
