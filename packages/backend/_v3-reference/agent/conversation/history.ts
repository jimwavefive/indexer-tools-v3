import type { ChatMessage } from '../provider.js';

export interface ConversationSummary {
  id: string;
  messageCount: number;
  lastMessagePreview: string;
  lastUpdated: Date;
}

export class ConversationStore {
  private conversations: Map<string, { messages: ChatMessage[]; lastUpdated: Date }> = new Map();

  get(id: string): ChatMessage[] | undefined {
    return this.conversations.get(id)?.messages;
  }

  append(id: string, message: ChatMessage): void {
    const existing = this.conversations.get(id);
    if (existing) {
      existing.messages.push(message);
      existing.lastUpdated = new Date();
    } else {
      this.conversations.set(id, {
        messages: [message],
        lastUpdated: new Date(),
      });
    }
  }

  list(): ConversationSummary[] {
    const summaries: ConversationSummary[] = [];

    for (const [id, data] of this.conversations.entries()) {
      const lastMsg = data.messages[data.messages.length - 1];
      const preview = lastMsg
        ? lastMsg.content.substring(0, 100) + (lastMsg.content.length > 100 ? '...' : '')
        : '';

      summaries.push({
        id,
        messageCount: data.messages.length,
        lastMessagePreview: preview,
        lastUpdated: data.lastUpdated,
      });
    }

    return summaries.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }

  clear(id: string): boolean {
    return this.conversations.delete(id);
  }

  has(id: string): boolean {
    return this.conversations.has(id);
  }
}
