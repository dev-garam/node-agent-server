import type { FeatureExecutionOutput, InferenceState } from "../pipeline/inferenceTypes.js";

export const postProcessing = async (
  state: InferenceState,
  execution: FeatureExecutionOutput | null
): Promise<InferenceState> => {
  if (!execution) {
    return state;
  }

  if (execution.promptAdditions?.length) {
    state.promptAdditions.push(...execution.promptAdditions);
  }

  if (execution.statePatch) {
    Object.assign(state, execution.statePatch);
  }

  if (execution.metadata) {
    state.metadata = {
      ...state.metadata,
      featureExecution: execution.metadata
    };
  }

  return state;
};

