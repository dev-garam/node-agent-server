import type { HistoryProvider } from "../history/historyProvider.js";
import type { InferenceState } from "../pipeline/inferenceTypes.js";

export const getHistory = async (
  state: InferenceState,
  provider: HistoryProvider
): Promise<InferenceState> => {
  const history = await provider.getHistory({ state: state.requestState });
  if (history.length > 0) {
    state.normalizedState.messages = [...history, ...state.normalizedState.messages];
  }
  return state;
};
