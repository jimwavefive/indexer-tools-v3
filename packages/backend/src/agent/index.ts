import { v4 as uuidv4 } from 'uuid';
import type { AIProvider, ChatMessage, ToolDefinition, ToolCall } from './provider.js';
import type { AgentTool } from './tools/index.js';
import { ConversationStore } from './conversation/history.js';

export const INDEXER_SYSTEM_PROMPT = `You are an AI assistant for managing The Graph Protocol indexer operations.

## Background
The Graph is a decentralized indexing protocol for querying blockchain data. Key concepts:

- **Indexers** run graph nodes to index subgraph deployments and serve queries. They stake GRT tokens.
- **Allocations** represent an indexer's stake commitment to a specific subgraph deployment. Indexers earn indexing rewards proportional to their allocation relative to total stake on that subgraph.
- **Signal / Curation** — Curators signal on subgraphs by depositing GRT, indicating which subgraphs are valuable. The signal amount on a subgraph influences how indexing rewards are distributed.
- **Epochs** — The protocol operates in epochs. Allocation rewards accrue per epoch based on the allocation's proportional share.
- **APR (Annual Percentage Rate)** — Estimated annualized return on allocated stake, calculated from signal proportion, issuance rate, and staked tokens.
- **Denied subgraphs** — Some subgraphs are denied rewards by the council; allocating to these earns no indexing rewards.

## Guidelines
- Use tools to query real data before answering questions about indexer state.
- When analyzing allocations, consider APR, daily rewards, signal strength, and deployment health.
- Always explain your reasoning and show relevant numbers.
- Never execute actions without explicit user confirmation. Propose changes and wait for approval.
- Present GRT amounts in human-readable format (not wei).
- When comparing allocations, consider both absolute rewards and APR efficiency.`;

const MAX_TOOL_ITERATIONS = 10;

export class AgentOrchestrator {
  private provider: AIProvider;
  private tools: AgentTool[];
  private toolDefinitions: ToolDefinition[];
  private toolMap: Map<string, AgentTool>;
  private conversations: ConversationStore;

  constructor(provider: AIProvider, tools: AgentTool[]) {
    this.provider = provider;
    this.tools = tools;
    this.toolDefinitions = tools.map((t) => t.definition);
    this.toolMap = new Map(tools.map((t) => [t.definition.name, t]));
    this.conversations = new ConversationStore();
  }

  async chat(
    userMessage: string,
    conversationId?: string,
  ): Promise<{ response: string; conversationId: string }> {
    const id = conversationId ?? uuidv4();

    // Append user message
    this.conversations.append(id, { role: 'user', content: userMessage });

    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const messages = this.conversations.get(id) ?? [];
      const response = await this.provider.chat(messages, this.toolDefinitions, INDEXER_SYSTEM_PROMPT);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Final response — no more tool calls
        const finalContent = response.content;
        this.conversations.append(id, { role: 'assistant', content: finalContent });
        return { response: finalContent, conversationId: id };
      }

      // There are tool calls to process.
      // First, record the assistant message (may have partial content alongside tool calls)
      // We store the content so the conversation includes any reasoning text.
      if (response.content) {
        this.conversations.append(id, { role: 'assistant', content: response.content });
      }

      // Execute each tool call and add results
      for (const toolCall of response.toolCalls) {
        const tool = this.toolMap.get(toolCall.name);
        let resultContent: string;

        if (!tool) {
          resultContent = JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
        } else {
          try {
            const result = await tool.execute(toolCall.arguments);
            resultContent = JSON.stringify(result);
          } catch (err: any) {
            resultContent = JSON.stringify({
              error: err.message ?? 'Tool execution failed',
            });
          }
        }

        this.conversations.append(id, {
          role: 'tool',
          content: resultContent,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });
      }
    }

    // Safety: if we hit max iterations, return what we have
    const finalMessage =
      'I reached the maximum number of tool call iterations. Here is what I found so far based on the data gathered.';
    this.conversations.append(id, { role: 'assistant', content: finalMessage });
    return { response: finalMessage, conversationId: id };
  }

  getConversationStore(): ConversationStore {
    return this.conversations;
  }
}

export { createProvider } from './provider.js';
export { agentTools } from './tools/index.js';
export type { AIProvider, ChatMessage, ToolDefinition, ToolCall } from './provider.js';
export type { AgentTool } from './tools/index.js';
export { ConversationStore } from './conversation/history.js';
