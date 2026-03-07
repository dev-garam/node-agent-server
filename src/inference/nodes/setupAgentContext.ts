import type { InferenceState } from "../pipeline/inferenceTypes.js";
import { resolveCurrentDateTimeContext } from "../time/currentDateTime.js";

export const setupAgentContext = async (state: InferenceState): Promise<InferenceState> => {
  const timeContext = resolveCurrentDateTimeContext(state.normalizedState.viewerTimezone);

  state.metadata.model = state.model;
  state.metadata.messageCount = state.normalizedState.messages.length;
  state.metadata.currentDateTime = timeContext.currentDateTime;
  state.metadata.currentDate = timeContext.currentDate;
  state.metadata.currentTime = timeContext.currentTime;
  state.metadata.currentTimezone = timeContext.currentTimezone;
  state.metadata.requestedTimezone = timeContext.requestedTimezone;

  state.requestState.currentDateTime = timeContext.currentDateTime;
  state.requestState.currentDate = timeContext.currentDate;
  state.requestState.currentTime = timeContext.currentTime;
  state.requestState.currentTimezone = timeContext.currentTimezone;

  state.normalizedState.currentDateTime = timeContext.currentDateTime;
  state.normalizedState.currentDate = timeContext.currentDate;
  state.normalizedState.currentTime = timeContext.currentTime;
  state.normalizedState.currentTimezone = timeContext.currentTimezone;

  return state;
};
