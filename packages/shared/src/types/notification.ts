export interface RuleConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  conditions: Record<string, unknown>;
  pollingIntervalMinutes?: number | null;
  lastPolledAt?: string | null;
  channelIds?: string[];
  groupIncidents?: boolean;
}

export interface ChannelConfig {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  title: string;
  message: string;
  severity: NotificationSeverity;
  timestamp: string;
  ruleId: string;
  metadata?: Record<string, unknown>;
}

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

export interface HistoryRecord {
  id: string;
  incidentId?: string;
  notification: Notification;
  channelIds: string[];
  timestamp: string;
  isTest?: boolean;
}

export interface IncidentChangeEvent {
  type: 'created' | 'updated' | 'auto-resolved';
  incidentId: string;
  ruleId: string;
  status: string;
  severity: string;
  targetLabel: string;
  title: string;
  timestamp: string;
}
