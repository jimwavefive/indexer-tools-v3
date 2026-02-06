import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// ----- Shared Types -----

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

// ----- Abstract Interface -----

export interface AIProvider {
  chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
  ): Promise<ChatResponse>;
}

// ----- Claude Provider -----

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor({ apiKey, model }: { apiKey: string; model?: string }) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? 'claude-sonnet-4-20250514';
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
  ): Promise<ChatResponse> {
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: msg.toolCallId!,
              content: msg.content,
            },
          ],
        };
      }

      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
        if (msg.content) {
          content.push({ type: 'text' as const, text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        return { role: 'assistant' as const, content };
      }

      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      };
    });

    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    let content = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, any>,
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

// ----- OpenAI Provider -----

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor({ apiKey, model }: { apiKey: string; model?: string }) {
    this.client = new OpenAI({ apiKey });
    this.model = model ?? 'gpt-4o';
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
  ): Promise<ChatResponse> {
    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId!,
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          openaiMessages.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          });
        } else {
          openaiMessages.push({
            role: 'assistant',
            content: msg.content,
          });
        }
      } else {
        openaiMessages.push({
          role: 'user',
          content: msg.content,
        });
      }
    }

    const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    });

    const choice = response.choices[0];
    const content = choice.message.content ?? '';
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

// ----- Ollama Provider -----

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;

  constructor({ baseUrl, model }: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = model ?? 'llama3.1';
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    systemPrompt: string,
  ): Promise<ChatResponse> {
    const ollamaMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === 'tool') {
        // Ollama doesn't have native tool result messages; wrap as user context
        ollamaMessages.push({
          role: 'user',
          content: `[Tool result for ${msg.toolName ?? msg.toolCallId}]: ${msg.content}`,
        });
      } else {
        ollamaMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Build Ollama-compatible tool definitions if the model supports them
    const ollamaTools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const body: Record<string, any> = {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
    };

    if (ollamaTools.length > 0) {
      body.tools = ollamaTools;
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama request failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    const message = data.message;
    const content = message?.content ?? '';
    const toolCalls: ToolCall[] = [];

    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        toolCalls.push({
          id: `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: tc.function.name,
          arguments: tc.function.arguments ?? {},
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}

// ----- Factory -----

export function createProvider(): AIProvider {
  const providerName = (process.env.AI_PROVIDER ?? 'claude').toLowerCase();

  switch (providerName) {
    case 'claude':
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var is required for Claude provider');
      return new ClaudeProvider({ apiKey, model: process.env.AI_MODEL });
    }
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY env var is required for OpenAI provider');
      return new OpenAIProvider({ apiKey, model: process.env.AI_MODEL });
    }
    case 'ollama': {
      return new OllamaProvider({
        baseUrl: process.env.OLLAMA_BASE_URL,
        model: process.env.AI_MODEL,
      });
    }
    default:
      throw new Error(`Unknown AI_PROVIDER: ${providerName}. Supported: claude, openai, ollama`);
  }
}
