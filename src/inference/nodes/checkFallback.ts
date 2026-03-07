import type { InferenceFeatureSelection } from "../pipeline/inferenceTypes.js";

export const checkFallback = (selection: InferenceFeatureSelection): boolean => {
  if (!selection.feature) {
    return true;
  }

  const parameters = selection.parsed?.parameters ?? {};
  for (const required of selection.feature.requiredParameters) {
    if (!required.required) {
      continue;
    }
    const value = parameters[required.name];
    if (value == null || value.length === 0) {
      return true;
    }
  }

  return false;
};

