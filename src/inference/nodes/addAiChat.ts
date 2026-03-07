import type { ConversationStore } from "../store/conversationStore.js";
import type { InferenceState } from "../pipeline/inferenceTypes.js";

export const addAiChat = async (
  state: InferenceState,
  store: ConversationStore
): Promise<InferenceState> => {
  const answer = state.finalAnswer;
  if (!answer) {
    return state;
  }

  const message = {
    role: "assistant" as const,
    content: answer.answer
  };
  await store.addAssistantMessage({ message });
  state.persistedMessages.push(message);
  return state;
};
