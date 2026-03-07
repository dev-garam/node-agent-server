import type { ConversationStore } from "../store/conversationStore.js";
import type { InferenceState } from "../pipeline/inferenceTypes.js";

export const saveHistory = async (
  state: InferenceState,
  store: ConversationStore
): Promise<InferenceState> => {
  if (state.persistedMessages.length === 0) {
    return state;
  }
  await store.saveHistory({ messages: state.persistedMessages });
  return state;
};
