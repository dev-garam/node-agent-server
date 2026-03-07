import type { ConversationStore } from "../store/conversationStore.js";
import type { InferenceState } from "../pipeline/inferenceTypes.js";

export const addUserChat = async (
  state: InferenceState,
  store: ConversationStore
): Promise<InferenceState> => {
  state.normalizedState.currentFeature = state.requestState.currentFeature;
  const lastUserMessage = [...state.requestState.messages].reverse().find((message) => message.role === "user");
  if (lastUserMessage) {
    await store.addUserMessage({ message: lastUserMessage });
    state.persistedMessages.push({ ...lastUserMessage });
  }
  return state;
};

