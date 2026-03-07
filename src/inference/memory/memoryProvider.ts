import type { ChatState, UserMemory } from "../../types/chat.js";

export interface MemoryProvider {
  getMemory(input: { state: ChatState }): Promise<UserMemory[]>;
}

export class NoopMemoryProvider implements MemoryProvider {
  async getMemory(input: { state: ChatState }): Promise<UserMemory[]> {
    return input.state.userMemory?.map((memory) => ({ ...memory })) ?? [];
  }
}

