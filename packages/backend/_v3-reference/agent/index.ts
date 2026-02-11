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

## Common Issues & Resolution

### Stale Failed Subgraphs
A **stale failure** occurs when a subgraph deployment's health status is "failed" but it has actually synced to the chain head. This happens when a graph-node encounters a transient error (RPC timeout, data corruption, etc.) and marks the deployment as failed, even though the data is up to date.

**How to detect:** Use \`checkSubgraphHealth\` — if \`isStale\` is true, the deployment has a stale failure (health=failed but all chains synced).

**How to fix:** Use \`graphman rewind\` to rewind the deployment to a block slightly before the chain head. This clears the failed status and allows the deployment to resume syncing normally.

**Resolution workflow:**
1. Call \`checkSubgraphHealth\` with the deployment hash to confirm it's a stale failure
2. From the health data, note the chain ID and the latest indexed block number
3. Calculate the rewind target: subtract 1 block from the latest indexed block (stale failures only need a 1-block rewind to clear the error)
4. Call \`proposeGraphmanRewind\` with the deployment hash, target block number, and chain ID
5. Wait for user approval, then execute with \`executeGraphmanRewind\`

### Behind Chain Head
A deployment is **behind chain head** when it's healthy but significantly behind the latest block on the chain. This is usually temporary (the node is catching up) but persistent lag may indicate resource issues.

### Failed Subgraphs (non-stale)
If a deployment is failed and NOT synced (\`isStale\` is false), it likely has a genuine fatal error (deterministic failure, bad mapping code, etc.). These cannot be fixed by rewind — the subgraph author needs to publish a fix.

## Guidelines
- Always use tools to query real data before answering. Start by investigating with \`checkSubgraphHealth\` and \`getSubgraphAllocation\`.
- When analyzing allocations, consider APR, daily rewards, signal strength, and deployment health.
- Always explain your reasoning and show relevant numbers.
- Never execute actions without explicit user confirmation. Propose changes and wait for approval.
- Present GRT amounts in human-readable format (not wei).
- When comparing allocations, consider both absolute rewards and APR efficiency.
- When investigating incidents, be proactive: use the available tools immediately rather than asking the user for information you can look up yourself.`;

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
      console.log(`Agent: iteration ${iterations}, sending ${messages.length} messages to LLM`);
      const response = await this.provider.chat(messages, this.toolDefinitions, INDEXER_SYSTEM_PROMPT);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Final response — no more tool calls
        const finalContent = response.content;
        this.conversations.append(id, { role: 'assistant', content: finalContent });
        console.log(`Agent: final response (${finalContent.length} chars)`);
        return { response: finalContent, conversationId: id };
      }

      // There are tool calls to process.
      console.log(`Agent: ${response.toolCalls.length} tool call(s): ${response.toolCalls.map((t) => t.name).join(', ')}`);

      // Store the assistant message with tool calls so the conversation history
      // is valid when replayed to the provider (OpenAI requires tool_calls on the
      // assistant message that precedes tool result messages).
      this.conversations.append(id, {
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls,
      });

      // Execute each tool call and add results
      for (const toolCall of response.toolCalls) {
        const tool = this.toolMap.get(toolCall.name);
        let resultContent: string;

        if (!tool) {
          resultContent = JSON.stringify({ error: `Unknown tool: ${toolCall.name}` });
          console.log(`Agent: tool ${toolCall.name} not found`);
        } else {
          try {
            console.log(`Agent: executing ${toolCall.name}(${JSON.stringify(toolCall.arguments).substring(0, 150)})`);
            const result = await tool.execute(toolCall.arguments);
            resultContent = JSON.stringify(result);
            console.log(`Agent: ${toolCall.name} completed (${resultContent.length} chars): ${resultContent.substring(0, 200)}`);
          } catch (err: any) {
            resultContent = JSON.stringify({
              error: err.message ?? 'Tool execution failed',
            });
            console.error(`Agent: ${toolCall.name} failed: ${err.message}`);
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
