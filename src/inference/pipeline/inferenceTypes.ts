import type { ChatRespondOutput } from "../../chat/chatResponder.js";
import type { Feature } from "../../intent/feature.js";
import type { IntentDetectionOutput } from "../../intent/intentDetector.js";
import type { ChatState, InStateChatMessage, UserMemory } from "../../types/chat.js";

export interface InferenceFeatureSelection {
  feature: Feature | null;
  parsed: IntentDetectionOutput["parsed"] | null;
  rawResponse: string;
}

export interface FeatureExecutionOutput {
  directResponse?: ChatRespondOutput;
  promptAdditions?: string[];
  statePatch?: Partial<InferenceState>;
  metadata?: Record<string, unknown>;
}

export interface FeatureExecutor {
  id: string;
  run(input: {
    state: InferenceState;
    selection: InferenceFeatureSelection;
  }): Promise<FeatureExecutionOutput>;
}

export interface InferenceTimings {
  totalMs: number;
  intentDetectMs?: number;
  intentParseMs?: number;
  featureExecMs?: number;
  finalAnswerMs?: number;
  firstChunkMs?: number;
}

export interface InferenceState {
  model: string;
  requestState: ChatState;
  normalizedState: ChatState;
  promptAdditions: string[];
  featureSelection: InferenceFeatureSelection | null;
  finalAnswer: ChatRespondOutput | null;
  intentResult: IntentDetectionOutput | null;
  metadata: Record<string, unknown>;
  persistedMessages: InStateChatMessage[];
  loadedMemory: UserMemory[];
  path: "answer_llm" | "feature_success" | "feature_failed";
  timings: Partial<InferenceTimings>;
}

export interface InferenceRunInput {
  model: string;
  state: ChatState;
}

export interface InferenceRunOutput extends ChatRespondOutput {
  intent: {
    parsed: IntentDetectionOutput["parsed"];
    rawResponse: string;
    matchedFeature: { id: string; title: string } | null;
  } | null;
  intentStatus: "ok" | "failed" | "pending";
  path: InferenceState["path"];
  timings: InferenceTimings;
}

export type InferenceStreamEvent =
  | { type: "message.start"; data: { model: string } }
  | { type: "message.delta"; data: { text: string } }
  | {
      type: "message.end";
      data: { answer: string; modelName?: string; finishReason?: string; path: InferenceState["path"] };
    }
  | {
      type: "intent.result";
      data: NonNullable<InferenceRunOutput["intent"]>;
    }
  | { type: "intent.error"; data: { message: string } }
  | { type: "done"; data: { path: InferenceState["path"]; timings: InferenceTimings } };
