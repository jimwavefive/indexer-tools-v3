import type { AgentTool, ToolDefinition } from './index.js';
import type { SqliteStore, IncidentRecord } from '../../db/sqliteStore.js';

let storeRef: SqliteStore | null = null;

export function setStoreRef(store: SqliteStore): void {
  storeRef = store;
}

function getStore(): SqliteStore {
  if (!storeRef) {
    throw new Error('SqliteStore not initialized for incident tools');
  }
  return storeRef;
}

export const getIncidentDetails: AgentTool = {
  definition: {
    name: 'getIncidentDetails',
    description: 'Get full details of a specific incident by ID, including metadata and notification history.',
    parameters: {
      type: 'object',
      properties: {
        incidentId: {
          type: 'string',
          description: 'The ID of the incident to retrieve',
        },
      },
      required: ['incidentId'],
    },
  },
  async execute(args: { incidentId: string }) {
    const store = getStore();
    const incident = store.getIncidentById(args.incidentId);

    if (!incident) {
      return { error: 'Incident not found', incidentId: args.incidentId };
    }

    return {
      id: incident.id,
      rule_id: incident.rule_id,
      target_key: incident.target_key,
      target_label: incident.target_label,
      severity: incident.severity,
      status: incident.status,
      auto_resolve: incident.auto_resolve,
      first_seen: incident.first_seen,
      last_seen: incident.last_seen,
      last_notified_at: incident.last_notified_at,
      resolved_at: incident.resolved_at,
      occurrence_count: incident.occurrence_count,
      latest_title: incident.latest_title,
      latest_message: incident.latest_message,
      latest_metadata: incident.latest_metadata,
      notification_history_count: incident.history.length,
    };
  },
};

export const listOpenIncidents: AgentTool = {
  definition: {
    name: 'listOpenIncidents',
    description: 'List all open or acknowledged incidents, optionally filtered by rule type.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'acknowledged', 'all'],
          description: 'Filter by incident status. "all" includes both open and acknowledged.',
        },
        ruleType: {
          type: 'string',
          description: 'Optional: filter by rule type (e.g., "failed_subgraph", "behind_chainhead")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of incidents to return (default: 50)',
        },
      },
    },
  },
  async execute(args: { status?: string; ruleType?: string; limit?: number }) {
    const store = getStore();
    const status = args.status === 'all' ? undefined : (args.status || 'open');

    // Get incidents with appropriate status filter
    let incidents: IncidentRecord[];
    if (status) {
      incidents = store.getIncidents({ status, limit: args.limit || 50 });
    } else {
      // Get both open and acknowledged
      const openIncidents = store.getIncidents({ status: 'open', limit: args.limit || 50 });
      const ackIncidents = store.getIncidents({ status: 'acknowledged', limit: args.limit || 50 });
      incidents = [...openIncidents, ...ackIncidents];
      // Sort by last_seen descending
      incidents.sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());
      if (args.limit) {
        incidents = incidents.slice(0, args.limit);
      }
    }

    // Filter by rule type if specified
    if (args.ruleType) {
      incidents = incidents.filter((i) => i.rule_id === args.ruleType || i.rule_id.includes(args.ruleType));
    }

    return {
      total: incidents.length,
      incidents: incidents.map((i) => ({
        id: i.id,
        rule_id: i.rule_id,
        target_label: i.target_label,
        severity: i.severity,
        status: i.status,
        first_seen: i.first_seen,
        last_seen: i.last_seen,
        occurrence_count: i.occurrence_count,
        latest_title: i.latest_title,
      })),
    };
  },
};

export const incidentTools: AgentTool[] = [getIncidentDetails, listOpenIncidents];
