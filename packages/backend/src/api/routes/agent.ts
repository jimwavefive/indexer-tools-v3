import { Router } from 'express';
import type { Request, Response } from 'express';
import { AgentOrchestrator, createProvider, agentTools } from '../../agent/index.js';

const router = Router();

let orchestrator: AgentOrchestrator | null = null;

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
    res.status(500).json({
      error: 'Agent encountered an error.',
      details: err.message ?? 'Unknown error',
    });
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
    res.status(500).json({ error: err.message ?? 'Unknown error' });
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
    res.status(500).json({ error: err.message ?? 'Unknown error' });
  }
});

export default router;
