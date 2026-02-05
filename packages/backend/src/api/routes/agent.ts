import { Router } from 'express';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AgentOrchestrator, createProvider, agentTools } from '../../agent/index.js';
import { setIncidentStoreRef, setSchedulerRef, setGraphmanStoreRef, setGraphmanContext } from '../../agent/tools/index.js';
import type { SqliteStore } from '../../db/sqliteStore.js';
import type { PollingScheduler } from '../../services/poller/scheduler.js';

const router = Router();

let orchestrator: AgentOrchestrator | null = null;
let storeRef: SqliteStore | null = null;

export function initializeAgentRoutes(store: SqliteStore, scheduler?: PollingScheduler): void {
  storeRef = store;
  setIncidentStoreRef(store);
  setGraphmanStoreRef(store);
  if (scheduler) {
    setSchedulerRef(scheduler);
  }
}

function getOrchestrator(): AgentOrchestrator {
  if (!orchestrator) {
    const provider = createProvider();
    orchestrator = new AgentOrchestrator(provider, agentTools);
  }
  return orchestrator;
}

function isAgentEnabled(): boolean {
  return process.env.FEATURE_AGENT_ENABLED === 'true';
}

// POST /api/agent/chat
router.post('/chat', async (req: Request, res: Response) => {
  if (!isAgentEnabled()) {
    res.status(403).json({ error: 'Agent feature is not enabled.' });
    return;
  }

  const { message, conversationId } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'A "message" string is required in the request body.' });
    return;
  }

  try {
    const agent = getOrchestrator();
    const result = await agent.chat(message, conversationId);
    res.json({
      response: result.response,
      conversationId: result.conversationId,
    });
  } catch (err: any) {
    console.error('Agent chat error:', err);
    res.status(500).json({ error: 'Agent encountered an error.' });
  }
});

// GET /api/agent/conversations
router.get('/conversations', (_req: Request, res: Response) => {
  if (!isAgentEnabled()) {
    res.status(403).json({ error: 'Agent feature is not enabled.' });
    return;
  }

  try {
    const agent = getOrchestrator();
    const conversations = agent.getConversationStore().list();
    res.json({ conversations });
  } catch (err: any) {
    console.error('List conversations error:', err);
    res.status(500).json({ error: 'Failed to list conversations.' });
  }
});

// DELETE /api/agent/conversations/:id
router.delete('/conversations/:id', (req: Request, res: Response) => {
  if (!isAgentEnabled()) {
    res.status(403).json({ error: 'Agent feature is not enabled.' });
    return;
  }

  try {
    const agent = getOrchestrator();
    const deleted = agent.getConversationStore().clear(req.params.id);
    res.json({ deleted, conversationId: req.params.id });
  } catch (err: any) {
    console.error('Delete conversation error:', err);
    res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

// POST /api/agent/incident/:id/chat - Start or continue a conversation about an incident
router.post('/incident/:id/chat', async (req: Request, res: Response) => {
  if (!isAgentEnabled()) {
    res.status(403).json({ error: 'Agent feature is not enabled.' });
    return;
  }

  if (!storeRef) {
    res.status(500).json({ error: 'Store not initialized.' });
    return;
  }

  const incidentId = req.params.id;
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'A "message" string is required in the request body.' });
    return;
  }

  try {
    // Check if incident exists
    const incident = storeRef.getIncidentById(incidentId);
    if (!incident) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }

    // Find existing active conversation for this incident, or create new one
    let conversation = storeRef.getConversationByIncident(incidentId);
    let conversationId: string;
    let isNewConversation = false;

    if (!conversation) {
      conversationId = uuidv4();
      storeRef.createConversation(conversationId, incidentId);
      isNewConversation = true;
    } else {
      conversationId = conversation.id;
    }

    // Build incident context for the first message
    let fullMessage = message;
    if (isNewConversation) {
      const incidentContext = buildIncidentContext(incident);
      fullMessage = `${incidentContext}\n\nUser request: ${message}`;
    }

    // Set graphman context so tools can create approvals
    setGraphmanContext(conversationId, incidentId);

    // Chat with the agent
    const agent = getOrchestrator();
    const result = await agent.chat(fullMessage, conversationId);

    // Persist messages to SQLite
    storeRef.appendConversationMessage(conversationId, {
      role: 'user',
      content: message,
    });
    storeRef.appendConversationMessage(conversationId, {
      role: 'assistant',
      content: result.response,
    });

    // Log the interaction
    storeRef.logAgentAction({
      conversation_id: conversationId,
      incident_id: incidentId,
      action_type: 'chat',
      result: 'success',
    });

    // Check for pending approval
    const pendingApproval = storeRef.getPendingApproval(conversationId);

    res.json({
      response: result.response,
      conversationId,
      incidentId,
      pendingApproval: pendingApproval ? {
        id: pendingApproval.id,
        action_type: pendingApproval.action_type,
        action_args: pendingApproval.action_args,
      } : null,
    });
  } catch (err: any) {
    console.error('Incident chat error:', err);
    res.status(500).json({ error: 'Agent encountered an error.' });
  }
});

// GET /api/agent/incident/:id/conversation - Get the conversation for an incident
router.get('/incident/:id/conversation', (req: Request, res: Response) => {
  if (!isAgentEnabled()) {
    res.status(403).json({ error: 'Agent feature is not enabled.' });
    return;
  }

  if (!storeRef) {
    res.status(500).json({ error: 'Store not initialized.' });
    return;
  }

  const incidentId = req.params.id;

  try {
    const conversation = storeRef.getConversationByIncident(incidentId);
    if (!conversation) {
      res.json({ conversation: null, messages: [] });
      return;
    }

    const messages = storeRef.getConversationMessages(conversation.id);
    const pendingApproval = storeRef.getPendingApproval(conversation.id);

    res.json({
      conversation,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })),
      pendingApproval: pendingApproval ? {
        id: pendingApproval.id,
        action_type: pendingApproval.action_type,
        action_args: pendingApproval.action_args,
      } : null,
    });
  } catch (err: any) {
    console.error('Get incident conversation error:', err);
    res.status(500).json({ error: 'Failed to get conversation.' });
  }
});

// POST /api/agent/incident/:id/approve - Approve a pending action
router.post('/incident/:id/approve', async (req: Request, res: Response) => {
  if (!isAgentEnabled()) {
    res.status(403).json({ error: 'Agent feature is not enabled.' });
    return;
  }

  if (!storeRef) {
    res.status(500).json({ error: 'Store not initialized.' });
    return;
  }

  const incidentId = req.params.id;
  const { approvalId } = req.body;

  if (!approvalId) {
    res.status(400).json({ error: 'approvalId is required.' });
    return;
  }

  try {
    const approval = storeRef.getApproval(approvalId);
    if (!approval) {
      res.status(404).json({ error: 'Approval not found.' });
      return;
    }

    if (approval.incident_id !== incidentId) {
      res.status(400).json({ error: 'Approval does not belong to this incident.' });
      return;
    }

    if (approval.status !== 'pending') {
      res.status(400).json({ error: `Approval is already ${approval.status}.` });
      return;
    }

    // Mark as approved
    storeRef.approveApproval(approvalId);

    // Log the approval
    storeRef.logAgentAction({
      conversation_id: approval.conversation_id,
      incident_id: incidentId,
      action_type: 'approve',
      tool_name: approval.action_type,
      tool_args: JSON.stringify(approval.action_args),
      result: 'approved',
    });

    // Continue the conversation with approval confirmation
    const agent = getOrchestrator();
    const result = await agent.chat(
      `The user has approved the action: ${approval.action_type}. Please proceed with execution using approvalId: ${approvalId}`,
      approval.conversation_id,
    );

    // Persist response
    storeRef.appendConversationMessage(approval.conversation_id, {
      role: 'assistant',
      content: result.response,
    });

    res.json({
      approved: true,
      approvalId,
      response: result.response,
      conversationId: approval.conversation_id,
    });
  } catch (err: any) {
    console.error('Approve action error:', err);
    res.status(500).json({ error: 'Failed to approve action.' });
  }
});

// POST /api/agent/incident/:id/reject - Reject a pending action
router.post('/incident/:id/reject', (req: Request, res: Response) => {
  if (!isAgentEnabled()) {
    res.status(403).json({ error: 'Agent feature is not enabled.' });
    return;
  }

  if (!storeRef) {
    res.status(500).json({ error: 'Store not initialized.' });
    return;
  }

  const incidentId = req.params.id;
  const { approvalId } = req.body;

  if (!approvalId) {
    res.status(400).json({ error: 'approvalId is required.' });
    return;
  }

  try {
    const approval = storeRef.getApproval(approvalId);
    if (!approval) {
      res.status(404).json({ error: 'Approval not found.' });
      return;
    }

    if (approval.incident_id !== incidentId) {
      res.status(400).json({ error: 'Approval does not belong to this incident.' });
      return;
    }

    if (approval.status !== 'pending') {
      res.status(400).json({ error: `Approval is already ${approval.status}.` });
      return;
    }

    // Mark as rejected
    storeRef.rejectApproval(approvalId);

    // Log the rejection
    storeRef.logAgentAction({
      conversation_id: approval.conversation_id,
      incident_id: incidentId,
      action_type: 'reject',
      tool_name: approval.action_type,
      tool_args: JSON.stringify(approval.action_args),
      result: 'rejected',
    });

    res.json({
      rejected: true,
      approvalId,
    });
  } catch (err: any) {
    console.error('Reject action error:', err);
    res.status(500).json({ error: 'Failed to reject action.' });
  }
});

// GET /api/agent/incident/:id/audit - Get audit log for an incident
router.get('/incident/:id/audit', (req: Request, res: Response) => {
  if (!isAgentEnabled()) {
    res.status(403).json({ error: 'Agent feature is not enabled.' });
    return;
  }

  if (!storeRef) {
    res.status(500).json({ error: 'Store not initialized.' });
    return;
  }

  const incidentId = req.params.id;
  const limit = parseInt(req.query.limit as string) || 50;

  try {
    const auditLog = storeRef.getAgentAuditLog({ incidentId, limit });
    res.json({ auditLog });
  } catch (err: any) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Failed to get audit log.' });
  }
});

function buildIncidentContext(incident: any): string {
  const metadata = incident.latest_metadata || {};

  let context = `## Incident Context
This conversation is about an active incident that needs investigation/resolution.

**Incident Details:**
- Rule: ${incident.rule_id}
- Target: ${incident.target_label}
- Severity: ${incident.severity}
- Status: ${incident.status}
- First seen: ${incident.first_seen}
- Last seen: ${incident.last_seen}
- Occurrence count: ${incident.occurrence_count}

**Latest Alert:**
${incident.latest_title}
${incident.latest_message}

**Metadata:**
${JSON.stringify(metadata, null, 2)}

Use the available tools to investigate this incident and propose solutions. If the incident is about a failed subgraph, you can use checkSubgraphHealth and getSubgraphAllocation to gather more information. If you determine that a graphman rewind is needed, propose it using proposeGraphmanRewind.
`;

  return context;
}

export default router;
