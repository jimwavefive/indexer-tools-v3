import type { Channel, Notification, ChannelConfig } from './Channel.js';

const SEVERITY_COLORS: Record<string, number> = {
  critical: 0xff0000,
  warning: 0xffaa00,
  info: 0x00aaff,
};

const RULE_LABELS: Record<string, { emoji: string; label: string }> = {
  'allocation-duration': { emoji: '⏰', label: 'Allocation Duration Warnings' },
  'signal-drop': { emoji: '📉', label: 'Signal Dropped to Zero' },
  proportion: { emoji: '⚖️', label: 'Disproportionate Allocations' },
  'subgraph-upgrade': { emoji: '🔄', label: 'Subgraph Upgrades' },
  'failed-subgraph': { emoji: '💀', label: 'Failed Subgraphs' },
  'behind-chainhead': { emoji: '🐢', label: 'Behind Chainhead' },
};

interface TableColumn {
  header: string;
  format: (item: Notification) => string;
}

interface TableSpec {
  columns: TableColumn[];
  sortValue: (item: Notification) => number;
  sortDirection: 'asc' | 'desc';
}

const RULE_TABLE_SPECS: Record<string, TableSpec> = {
  'subgraph-upgrade': {
    columns: [
      { header: 'GRT', format: (n) => formatGRT((n.metadata?.allocatedGRT as string) ?? '?') },
      { header: 'APR', format: (n) => `${n.metadata?.apr ?? '?'}%` },
    ],
    sortValue: (n) => parseFloat((n.metadata?.apr as string) ?? '0'),
    sortDirection: 'asc',
  },
  'allocation-duration': {
    columns: [
      { header: 'Epochs', format: (n) => String(n.metadata?.epochDuration ?? '?') },
      { header: 'Threshold', format: (n) => String(n.metadata?.thresholdEpochs ?? '?') },
    ],
    sortValue: (n) => Number(n.metadata?.epochDuration ?? 0),
    sortDirection: 'desc',
  },
  proportion: {
    columns: [
      { header: 'Ratio', format: (n) => {
        const ratio = n.metadata?.ratio ?? n.metadata?.proportionRatio;
        return ratio !== undefined ? Number(ratio).toFixed(3) : '?';
      }},
      { header: 'Threshold', format: (n) => String(n.metadata?.threshold ?? '?') },
    ],
    sortValue: (n) => parseFloat((n.metadata?.ratio as string) ?? (n.metadata?.proportionRatio as string) ?? '0'),
    sortDirection: 'asc',
  },
  'signal-drop': {
    columns: [],
    sortValue: () => 0,
    sortDirection: 'asc',
  },
};

const MAX_RETRIES = 2;
const DISCORD_EMBED_CHAR_LIMIT = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateHash(hash: string): string {
  if (!hash || hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

const METADATA_LABELS: Record<string, string> = {
  allocatedGRT: 'Allocated GRT',
  apr: 'APR',
  latestDeploymentHash: 'New Deployment',
  currentDeploymentHash: 'Old Deployment',
  currentDeploymentHashes: 'Old Deployments',
  epochDuration: 'Epoch Duration',
  thresholdEpochs: 'Threshold',
  ratio: 'Ratio',
  threshold: 'Threshold',
  signalProportion: 'Signal Proportion',
  stakeProportion: 'Stake Proportion',
  signalledTokens: 'Signal',
  minGrt: 'Min GRT Filter',
  blocksBehindThreshold: 'Blocks Behind Threshold',
};

const METADATA_HIDDEN = new Set(['allocationId', 'deploymentIpfsHash', 'subgraphId', 'subgraphName', 'subgraphs', 'count']);

// Preferred display order — keys not listed here appear at the end in original order
const METADATA_ORDER: string[] = [
  'currentDeploymentHash', 'currentDeploymentHashes',
  'latestDeploymentHash',
  'allocatedGRT', 'apr',
  'epochDuration', 'thresholdEpochs',
  'ratio', 'threshold',
  'signalProportion', 'stakeProportion',
  'signalledTokens',
];

function formatMetadataValue(key: string, raw: unknown): string {
  if (key === 'allocatedGRT' || key === 'allocatedTokens') return formatGRT(String(raw));
  if (key === 'apr') return `${raw}%`;
  if (key === 'signalProportion' || key === 'stakeProportion') return `${(Number(raw) * 100).toFixed(4)}%`;
  if (key === 'epochDuration' || key === 'thresholdEpochs') return `${raw} epochs`;
  if (key === 'ratio' || key === 'threshold') return Number(raw).toFixed(3);
  if (key === 'signalledTokens') return formatGRT(String(Math.round(Number(raw) / 1e18)));
  if (Array.isArray(raw)) return raw.join(', ');
  return String(raw);
}

/** Map raw metadata to ordered [label, formattedValue] pairs. */
function formatMetadataBlock(metadata: Record<string, unknown>): [string, string][] {
  const keys = Object.keys(metadata).filter((k) => !METADATA_HIDDEN.has(k));
  keys.sort((a, b) => {
    const ai = METADATA_ORDER.indexOf(a);
    const bi = METADATA_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return keys.map((key) => [
    METADATA_LABELS[key] || key,
    formatMetadataValue(key, metadata[key]),
  ]);
}

function formatGRT(value: string): string {
  const num = parseInt(value, 10);
  if (isNaN(num)) return value;
  return num.toLocaleString('en-US');
}

export class DiscordChannel implements Channel {
  id: string;
  name: string;
  type = 'discord' as const;
  enabled: boolean;
  config: Record<string, unknown>;

  private webhookUrl: string;

  constructor(channelConfig: ChannelConfig) {
    this.id = channelConfig.id;
    this.name = channelConfig.name;
    this.enabled = channelConfig.enabled;
    this.config = channelConfig.config;
    this.webhookUrl = channelConfig.config.webhookUrl as string;

    if (!this.webhookUrl) {
      throw new Error(`Discord channel "${this.name}" is missing webhookUrl in config`);
    }
  }

  async send(notification: Notification): Promise<void> {
    await this.sendBatch([notification]);
  }

  async sendBatch(notifications: Notification[], filterSummaries?: Map<string, string>): Promise<void> {
    if (notifications.length === 0 && (!filterSummaries || filterSummaries.size === 0)) return;

    // Single notification with no filter summaries — send as a simple embed
    if (notifications.length === 1 && (!filterSummaries || filterSummaries.size === 0)) {
      await this.postEmbed(this.buildSingleEmbed(notifications[0]));
      return;
    }

    // Multiple notifications or filter summaries — group by rule and build a digest
    const embeds = this.buildDigestEmbeds(notifications, filterSummaries);
    for (const embed of embeds) {
      await this.postEmbed(embed);
    }
  }

  private buildSingleEmbed(notification: Notification): Record<string, unknown> {
    const color = SEVERITY_COLORS[notification.severity] ?? SEVERITY_COLORS.info;

    let description = notification.message;

    if (notification.metadata) {
      const meta = notification.metadata;
      const oldHash = meta.currentDeploymentHash || meta.deploymentIpfsHash;
      const newHash = meta.latestDeploymentHash;

      if (oldHash) {
        description += `\n**Old Deployment**\n\`${oldHash}\``;
      }
      if (newHash) {
        description += `\n**New Deployment**\n\`${newHash}\``;
      }
    }

    return {
      title: notification.title,
      description,
      color,
      timestamp: notification.timestamp,
      footer: {
        text: `Rule: ${notification.ruleId} | Severity: ${notification.severity}`,
      },
    };
  }

  private buildDigestEmbeds(notifications: Notification[], filterSummaries?: Map<string, string>): Record<string, unknown>[] {
    // Group by ruleId
    const grouped = new Map<string, Notification[]>();
    for (const n of notifications) {
      const list = grouped.get(n.ruleId) || [];
      list.push(n);
      grouped.set(n.ruleId, list);
    }

    // Determine highest severity for the embed color
    const highestSeverity = notifications.some((n) => n.severity === 'critical')
      ? 'critical'
      : notifications.some((n) => n.severity === 'warning')
        ? 'warning'
        : 'info';

    // Build description, truncating line by line to stay under Discord's 4096 char limit
    const DESCRIPTION_LIMIT = 3900; // leave headroom for truncation notice
    let description = '';
    let shownCount = 0;
    let truncated = false;

    for (const [ruleId, items] of grouped) {
      if (truncated) break;

      const ruleInfo = RULE_LABELS[ruleId] || { emoji: '🔔', label: ruleId };
      // Use metadata count if available (single-notification rules pack count into metadata)
      const itemCount = (items.length === 1 && typeof items[0].metadata?.count === 'number')
        ? items[0].metadata.count as number
        : items.length;
      const header = `### ${ruleInfo.emoji} ${ruleInfo.label} (${itemCount})\n`;

      if (description.length + header.length > DESCRIPTION_LIMIT) {
        truncated = true;
        break;
      }
      description += header;

      const tableSpec = RULE_TABLE_SPECS[ruleId];

      // If no table spec and items contain pre-formatted messages, render directly
      if (!tableSpec && items.length === 1) {
        const msg = items[0].message + '\n\n';
        if (description.length + msg.length > DESCRIPTION_LIMIT) {
          truncated = true;
          break;
        }
        description += msg;
        shownCount++;
      } else {
        const rows = items.map((item) => {
          const nameMatch = item.message.match(/\*\*(.+?)\*\*/);
          const name = nameMatch ? nameMatch[1] : 'Unknown';
          const cells: string[] = [name];
          if (tableSpec) {
            for (const col of tableSpec.columns) {
              cells.push(col.format(item));
            }
          }
          return { cells, sortValue: tableSpec?.sortValue(item) ?? 0 };
        });

        if (tableSpec) {
          rows.sort((a, b) =>
            tableSpec.sortDirection === 'desc' ? b.sortValue - a.sortValue : a.sortValue - b.sortValue,
          );
        }

        const headers = ['Name', ...(tableSpec?.columns.map((c) => c.header) ?? [])];
        const colWidths = headers.map((h, i) =>
          Math.max(h.length, ...rows.map((r) => r.cells[i].length)),
        );

        const hdrLine = headers.map((h, i) => (i === 0 ? h.padEnd(colWidths[i]) : h.padStart(colWidths[i]))).join('  ');
        const sep = '─'.repeat(hdrLine.length);
        let table = '```\n' + hdrLine + '\n' + sep + '\n';

        for (const row of rows) {
          const line = row.cells.map((c, i) => (i === 0 ? c.padEnd(colWidths[i]) : c.padStart(colWidths[i]))).join('  ') + '\n';
          if (description.length + table.length + line.length + 4 > DESCRIPTION_LIMIT) {
            truncated = true;
            break;
          }
          table += line;
          shownCount++;
        }

        table += '```\n';
        description += table;
      }

      description += '\n';
    }

    // Append filter summaries for rules that had matches filtered out
    if (filterSummaries) {
      for (const [ruleId, summary] of filterSummaries) {
        if (grouped.has(ruleId)) continue; // rule already has notifications shown
        if (truncated) break;

        const ruleInfo = RULE_LABELS[ruleId] || { emoji: '🔔', label: ruleId };
        const line = `### ${ruleInfo.emoji} ${ruleInfo.label}\n*${summary}*\n\n`;

        if (description.length + line.length > DESCRIPTION_LIMIT) {
          truncated = true;
          break;
        }
        description += line;
      }
    }

    if (truncated) {
      const remaining = notifications.length - shownCount;
      description += `\n*…and ${remaining} more alerts (${notifications.length} total)*`;
    }

    const embed = {
      title: `📋 Indexer Alert Digest — ${notifications.length} notifications`,
      description,
      color: SEVERITY_COLORS[highestSeverity],
      timestamp: new Date().toISOString(),
      footer: {
        text: `${grouped.size} rule type(s) triggered | Cooldown: 1 hour`,
      },
    };

    return [embed];
  }

  private async postEmbed(embed: Record<string, unknown>): Promise<void> {
    const body = JSON.stringify({ embeds: [embed] });
    // ?wait=true makes Discord validate and return errors instead of silently dropping
    const url = this.webhookUrl + (this.webhookUrl.includes('?') ? '&' : '?') + 'wait=true';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (response.ok) return;

      if (response.status === 429) {
        const json = (await response.json().catch(() => ({ retry_after: 1 }))) as {
          retry_after?: number;
        };
        const retryAfter = (json.retry_after ?? 1) * 1000;
        if (attempt < MAX_RETRIES) {
          await sleep(retryAfter + 100);
          continue;
        }
      }

      const text = await response.text().catch(() => 'unknown error');
      throw new Error(`Discord webhook failed (${response.status}): ${text}`);
    }
  }
}
