import type { InStateChatMessage } from "../../types/chat.js";

export interface ConversationStore {
  addUserMessage(input: { message: InStateChatMessage }): Promise<void>;
  addAssistantMessage(input: { message: InStateChatMessage }): Promise<void>;
  saveHistory(input: { messages: InStateChatMessage[] }): Promise<void>;
}

export class NoopConversationStore implements ConversationStore {
  async addUserMessage(): Promise<void> {}

  async addAssistantMessage(): Promise<void> {}

  async saveHistory(): Promise<void> {}
}

