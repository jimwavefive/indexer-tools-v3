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
};

const MAX_RETRIES = 2;
const DISCORD_EMBED_CHAR_LIMIT = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  async sendBatch(notifications: Notification[]): Promise<void> {
    if (notifications.length === 0) return;

    // Single notification — send as a simple embed
    if (notifications.length === 1) {
      await this.postEmbed(this.buildSingleEmbed(notifications[0]));
      return;
    }

    // Multiple notifications — group by rule and build a digest
    const embeds = this.buildDigestEmbeds(notifications);
    for (const embed of embeds) {
      await this.postEmbed(embed);
    }
  }

  private buildSingleEmbed(notification: Notification): Record<string, unknown> {
    const color = SEVERITY_COLORS[notification.severity] ?? SEVERITY_COLORS.info;
    return {
      title: notification.title,
      description: notification.message,
      color,
      timestamp: notification.timestamp,
      footer: {
        text: `Rule: ${notification.ruleId} | Severity: ${notification.severity}`,
      },
      fields: notification.metadata
        ? Object.entries(notification.metadata)
            .filter(([k]) => k !== 'allocationId' && k !== 'deploymentIpfsHash')
            .map(([name, value]) => ({
              name,
              value: String(value),
              inline: true,
            }))
        : [],
    };
  }

  private buildDigestEmbeds(notifications: Notification[]): Record<string, unknown>[] {
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
      const header = `### ${ruleInfo.emoji} ${ruleInfo.label} (${items.length})\n`;

      if (description.length + header.length > DESCRIPTION_LIMIT) {
        truncated = true;
        break;
      }
      description += header;

      for (const item of items) {
        const nameMatch = item.message.match(/\*\*(.+?)\*\*/);
        const name = nameMatch ? nameMatch[1] : 'Unknown';
        const hash = (item.metadata?.deploymentIpfsHash as string) || '';
        const shortHash = hash ? ` \`${hash.slice(0, 8)}…\`` : '';

        let detail = '';
        if (ruleId === 'allocation-duration') {
          const epochs = item.metadata?.epochDuration ?? '?';
          const threshold = item.metadata?.thresholdEpochs ?? '?';
          detail = ` — ${epochs} epochs (threshold: ${threshold})`;
        } else if (ruleId === 'proportion') {
          const ratio = item.metadata?.ratio ?? item.metadata?.proportionRatio;
          detail = ratio !== undefined ? ` — ratio: ${Number(ratio).toFixed(3)}` : '';
        }

        const line = `• **${name}**${shortHash}${detail}\n`;

        if (description.length + line.length > DESCRIPTION_LIMIT) {
          truncated = true;
          break;
        }

        description += line;
        shownCount++;
      }

      description += '\n';
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
