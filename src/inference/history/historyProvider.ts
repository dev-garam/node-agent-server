import type { ChatState, InStateChatMessage } from "../../types/chat.js";

export interface HistoryProvider {
  getHistory(input: { state: ChatState }): Promise<InStateChatMessage[]>;
}

export class NoopHistoryProvider implements HistoryProvider {
  async getHistory(): Promise<InStateChatMessage[]> {
    return [];
  }
}

