import type { ChannelConfig, Notification, NotificationSeverity } from '@indexer-tools/shared';

export interface Channel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  send(notification: Notification): Promise<void>;
  sendBatch(notifications: Notification[], filterSummaries?: Map<string, string>): Promise<void>;
}

export type { ChannelConfig, Notification, NotificationSeverity };
