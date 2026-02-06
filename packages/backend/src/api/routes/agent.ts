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
let schedulerRef: PollingScheduler | null = null;

export function initializeAgentRoutes(store: SqliteStore, scheduler?: PollingScheduler): void {
  storeRef = store;
  schedulerRef = scheduler || null;
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
    console.log(`Agent chat: message="${message.substring(0, 80)}..." conversationId=${conversationId || 'new'}`);
    const agent = getOrchestrator();
    const result = await agent.chat(message, conversationId);
    console.log(`Agent chat: responded (${result.response.length} chars)`);
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
    const agent = getOrchestrator();
    let conversation = storeRef.getConversationByIncident(incidentId);
    let conversationId: string;
    let isNewConversation = false;

    if (!conversation) {
      conversationId = uuidv4();
      storeRef.createConversation(conversationId, incidentId);
      isNewConversation = true;
    } else {
      conversationId = conversation.id;
      // Detect stale conversation: SQLite has it but in-memory orchestrator lost it (e.g. after restart)
      if (!agent.getConversationStore().has(conversationId)) {
        // Wipe the old SQLite conversation and start fresh
        storeRef.deleteConversation(conversationId);
        conversationId = uuidv4();
        storeRef.createConversation(conversationId, incidentId);
        isNewConversation = true;
        console.log(`Incident chat: stale conversation detected, starting fresh for incident ${incidentId}`);
      }
    }

    // Build incident context for the first message
    let fullMessage = message;
    if (isNewConversation) {
      const incidentContext = buildIncidentContext(incident);
      fullMessage = `${incidentContext}\n\nUser request: ${message}`;
      console.log(`Incident chat: new conversation ${conversationId} for incident ${incidentId}`);
    } else {
      console.log(`Incident chat: continuing conversation ${conversationId} for incident ${incidentId}`);
    }

    // Set graphman context so tools can create approvals
    setGraphmanContext(conversationId, incidentId);

    // Chat with the agent
    console.log(`Incident chat: sending to LLM (message length: ${fullMessage.length})`);
    const result = await agent.chat(fullMessage, conversationId);
    console.log(`Incident chat: LLM responded (response length: ${result.response.length})`);

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

// DELETE /api/agent/incident/:id/conversation - Reset the conversation for an incident
router.delete('/incident/:id/conversation', (req: Request, res: Response) => {
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
    if (conversation) {
      // Clear from in-memory orchestrator
      const agent = getOrchestrator();
      agent.getConversationStore().clear(conversation.id);
      // Delete from SQLite
      storeRef.deleteConversation(conversation.id);
      console.log(`Incident chat: conversation reset for incident ${incidentId}`);
    }
    res.json({ deleted: true, incidentId });
  } catch (err: any) {
    console.error('Delete incident conversation error:', err);
    res.status(500).json({ error: 'Failed to delete conversation.' });
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
`;

  // Add rule-type-specific instructions
  if (incident.rule_id === 'failed-subgraph') {
    const subgraphs = metadata.subgraphs || [];

    // Pre-classify deployments using cached status data from the poller
    const staleDeployments: Array<{ hash: string; name: string; chainId: string; latestBlock: number; error: string }> = [];
    const genuineFailures: Array<{ hash: string; name: string; error: string }> = [];
    const unknownDeployments: string[] = [];

    const statuses = schedulerRef?.latestDeploymentStatuses;

    for (const sg of subgraphs) {
      const hash = sg.deploymentHash;
      if (!hash) continue;

      if (!statuses) {
        unknownDeployments.push(hash);
        continue;
      }

      const status = statuses.get(hash);
      if (!status) {
        unknownDeployments.push(hash);
        continue;
      }

      const allSynced = status.chains.every((c: any) => {
        const chainhead = parseInt(c.chainHeadBlock?.number || '0', 10);
        const latest = parseInt(c.latestBlock?.number || '0', 10);
        return (chainhead - latest) < 100;
      });

      if (status.health === 'failed' && allSynced) {
        // Find chain info for the rewind
        const primaryChain = status.chains[0];
        const chainId = primaryChain?.network === 'mainnet' ? '1'
          : primaryChain?.network === 'arbitrum-one' ? '42161'
          : primaryChain?.network === 'gnosis' ? '100'
          : primaryChain?.network === 'base' ? '8453'
          : primaryChain?.network || 'unknown';
        const latestBlock = parseInt(primaryChain?.latestBlock?.number || '0', 10);

        staleDeployments.push({
          hash,
          name: sg.name || hash.substring(0, 12),
          chainId,
          latestBlock,
          error: status.fatalError?.message?.substring(0, 100) || 'unknown',
        });
      } else {
        genuineFailures.push({
          hash,
          name: sg.name || hash.substring(0, 12),
          error: status.fatalError?.message?.substring(0, 150) || 'unknown',
        });
      }
    }

    context += `
## Pre-classified Deployment Status
The system has already checked all ${subgraphs.length} failed deployments against cached health data.

### Stale Failures (fixable with rewind): ${staleDeployments.length}
These deployments are marked "failed" but are synced to chainhead — a 1-block rewind will clear the error.
${staleDeployments.length > 0 ? staleDeployments.map((d) =>
  `- **${d.name}** \`${d.hash}\` — chain: ${d.chainId}, rewind to block: ${d.latestBlock - 1}, error: ${d.error}`
).join('\n') : 'None found.'}

### Genuine Failures (not fixable with rewind): ${genuineFailures.length}
These deployments are failed and NOT synced — they have real errors that need subgraph code fixes.
${genuineFailures.length > 0 ? genuineFailures.map((d) =>
  `- **${d.name}** \`${d.hash}\` — error: ${d.error}`
).join('\n') : 'None found.'}
${unknownDeployments.length > 0 ? `\n### Unknown status: ${unknownDeployments.length}\nUse \`checkSubgraphHealth\` to investigate: ${unknownDeployments.join(', ')}` : ''}

## Instructions
${staleDeployments.length > 0 ? `Propose \`proposeGraphmanRewind\` for ALL ${staleDeployments.length} stale deployments listed above. Use the chain ID and rewind block number provided. Do NOT skip any — process every single one.` : 'Report the genuine failure details to the user.'}
`;
  } else if (incident.rule_id === 'behind-chainhead') {
    context += `
## Investigation Instructions
This is a **behind chainhead** incident. The deployment is healthy but lagging behind the chain head.

**Steps:**
1. Call \`checkSubgraphHealth\` to see how far behind each chain is
2. Report the lag in blocks and estimate sync time
3. If the deployment is also failed, check if it's a stale failure
`;
  } else {
    context += `
## Investigation Instructions
Use the available tools to investigate this incident. Start by checking deployment health with \`checkSubgraphHealth\` and allocation details with \`getSubgraphAllocation\` if relevant.
`;
  }

  return context;
}

export default router;
