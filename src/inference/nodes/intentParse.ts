import type { Feature } from "../../intent/feature.js";
import type { IntentDetectionOutput } from "../../intent/intentDetector.js";
import type { InferenceFeatureSelection } from "../pipeline/inferenceTypes.js";

export const intentParse = (
  intent: IntentDetectionOutput,
  matchedFeature: Feature | undefined
): InferenceFeatureSelection => ({
  feature: matchedFeature ?? null,
  parsed: intent.parsed,
  rawResponse: intent.rawResponse
});

