import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RuleConfig } from '../services/notifications/rules/Rule.js';
import type { ChannelConfig } from '../services/notifications/channels/Channel.js';
import type { HistoryRecord } from '../services/notifications/NotificationEngine.js';

const DEFAULT_DB_PATH = './data/notifications.json';

interface StoreData {
  rules: RuleConfig[];
  channels: ChannelConfig[];
  history: HistoryRecord[];
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

const DEFAULT_DATA: StoreData = {
  rules: DEFAULT_RULES,
  channels: [],
  history: [],
};

export class JsonStore {
  private dbPath: string;
  private data: StoreData | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.DB_PATH || DEFAULT_DB_PATH;
  }

  private async load(): Promise<StoreData> {
    if (this.data) return this.data;

    try {
      const raw = await readFile(this.dbPath, 'utf-8');
      this.data = JSON.parse(raw) as StoreData;
    } catch {
      // File doesn't exist or is invalid - create with defaults
      this.data = { ...DEFAULT_DATA };
      await this.persist();
    }

    return this.data;
  }

  private async persist(): Promise<void> {
    if (!this.data) return;
    const dir = dirname(this.dbPath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  async getRules(): Promise<RuleConfig[]> {
    const data = await this.load();
    return data.rules;
  }

  async saveRules(rules: RuleConfig[]): Promise<void> {
    const data = await this.load();
    data.rules = rules;
    await this.persist();
  }

  async getChannels(): Promise<ChannelConfig[]> {
    const data = await this.load();
    return data.channels;
  }

  async saveChannels(channels: ChannelConfig[]): Promise<void> {
    const data = await this.load();
    data.channels = channels;
    await this.persist();
  }

  async getHistory(): Promise<HistoryRecord[]> {
    const data = await this.load();
    return data.history;
  }

  async addHistory(record: HistoryRecord): Promise<void> {
    const data = await this.load();
    data.history.push(record);
    await this.persist();
  }

  async clearHistory(): Promise<void> {
    const data = await this.load();
    data.history = [];
    await this.persist();
  }
}
