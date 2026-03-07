import type { FeatureExecutorRegistry } from "../features/registry.js";
import type { FeatureExecutionOutput, InferenceState } from "../pipeline/inferenceTypes.js";

export const executeFeatureFunction = async (
  state: InferenceState,
  registry: FeatureExecutorRegistry
): Promise<FeatureExecutionOutput | null> => {
  const selection = state.featureSelection;
  if (!selection?.feature) {
    return null;
  }
  const featureId = selection.feature.id;

  const executor = registry.get(featureId);
  if (!executor) {
    return null;
  }

  return executor.run({
    state,
    selection
  });
};
