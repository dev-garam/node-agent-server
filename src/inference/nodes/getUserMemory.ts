import type { MemoryProvider } from "../memory/memoryProvider.js";
import type { InferenceState } from "../pipeline/inferenceTypes.js";

export const getUserMemory = async (
  state: InferenceState,
  provider: MemoryProvider
): Promise<InferenceState> => {
  const memory = await provider.getMemory({ state: state.requestState });
  state.loadedMemory = memory;
  state.normalizedState.userMemory = memory;
  return state;
};
