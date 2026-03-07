import type { IntentDetector } from "../../intent/intentDetector.js";
import type { InferenceState } from "../pipeline/inferenceTypes.js";

export const intentDetect = async (state: InferenceState, detector: IntentDetector) =>
  detector.detect({ state: state.normalizedState });

