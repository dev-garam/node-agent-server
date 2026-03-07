import type { ChatResponder } from "../../chat/chatResponder.js";
import type { InferenceState } from "../pipeline/inferenceTypes.js";

export const buildAnswerSystemPrompt = (state: InferenceState): string => {
  const baseInstructions = [
    "You are responding inside the node-agent inference pipeline.",
    `Current datetime: ${String(state.metadata.currentDateTime ?? state.normalizedState.currentDateTime ?? new Date().toISOString())}`,
    `Current date: ${String(state.metadata.currentDate ?? state.normalizedState.currentDate ?? "")}`,
    `Current time: ${String(state.metadata.currentTime ?? state.normalizedState.currentTime ?? "")}`,
    `Current timezone: ${String(state.metadata.currentTimezone ?? state.normalizedState.currentTimezone ?? state.normalizedState.viewerTimezone ?? "UTC")}`,
    "Use the current datetime values above when interpreting words like today, tomorrow, now, this morning, and tonight.",
    "Do not invent a different current date, current time, or current timezone reference."
  ];

  if (state.promptAdditions.length === 0) {
    return baseInstructions.join("\n\n");
  }

  return [...baseInstructions, ...state.promptAdditions].join("\n\n");
};

export const processFinalAnswer = async (
  state: InferenceState,
  responder: ChatResponder
) => {
  return responder.respond({
    state: state.normalizedState,
    systemPrompt: buildAnswerSystemPrompt(state)
  });
};
