export type ChatRole = "user" | "assistant";

export interface UserMemory {
  key: string;
  content: string;
  targetDate?: string | null;
}

export interface InStateChatMessage {
  role: ChatRole;
  content: string;
  imageDescription?: string;
}

export interface ChatState {
  messages: InStateChatMessage[];
  viewerTimezone?: string;
  imageDescription?: string;
  userMemory?: UserMemory[];
  currentFeature?: { id: string };
}
