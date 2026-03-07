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
  viewerAddress?: string;
  viewerCountry?: string;
  viewerCity?: string;
  viewerLat?: number;
  viewerLon?: number;
  currentDateTime?: string;
  currentDate?: string;
  currentTime?: string;
  currentTimezone?: string;
  imageDescription?: string;
  userMemory?: UserMemory[];
  currentFeature?: { id: string };
}
