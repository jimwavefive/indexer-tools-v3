export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  title: string;
  message: string;
  severity: NotificationSeverity;
  timestamp: string;
  ruleId: string;
  metadata?: Record<string, unknown>;
}

export interface Channel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  send(notification: Notification): Promise<void>;
  sendBatch(notifications: Notification[]): Promise<void>;
}

export interface ChannelConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}
