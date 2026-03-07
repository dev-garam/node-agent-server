import type { ChatState } from "../../types/chat.js";
import type { InferenceRunInput, InferenceState } from "./inferenceTypes.js";

const cloneState = (state: ChatState): ChatState => ({
  ...state,
  messages: state.messages.map((message) => ({ ...message })),
  userMemory: state.userMemory?.map((memory) => ({ ...memory })),
  currentFeature: state.currentFeature ? { ...state.currentFeature } : undefined
});

export const createInferenceState = (input: InferenceRunInput): InferenceState => ({
  model: input.model,
  requestState: cloneState(input.state),
  normalizedState: cloneState(input.state),
  promptAdditions: [],
  featureSelection: null,
  finalAnswer: null,
  intentResult: null,
  metadata: {},
  persistedMessages: [],
  loadedMemory: input.state.userMemory?.map((memory) => ({ ...memory })) ?? [],
  path: "answer_llm",
  timings: {}
});
