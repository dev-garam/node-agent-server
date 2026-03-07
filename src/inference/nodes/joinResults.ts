import type { InferenceRunOutput, InferenceState } from "../pipeline/inferenceTypes.js";

export const joinResults = (state: InferenceState): InferenceRunOutput => {
  const selected = state.finalAnswer;
  if (!selected) {
    throw new Error("pipeline produced no answer");
  }

  return {
    ...selected,
    intent:
      state.intentResult && state.featureSelection
        ? {
            parsed: state.intentResult.parsed,
            rawResponse: state.intentResult.rawResponse,
            matchedFeature: state.featureSelection.feature
              ? {
                  id: state.featureSelection.feature.id,
                  title: state.featureSelection.feature.title
                }
              : null
          }
        : null,
    intentStatus: state.intentResult ? "ok" : "failed",
    path: state.path,
    timings: {
      totalMs: state.timings.totalMs ?? 0,
      intentDetectMs: state.timings.intentDetectMs,
      intentParseMs: state.timings.intentParseMs,
      featureExecMs: state.timings.featureExecMs,
      finalAnswerMs: state.timings.finalAnswerMs,
      firstChunkMs: state.timings.firstChunkMs
    }
  };
};
