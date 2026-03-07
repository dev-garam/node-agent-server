import type { FastifyBaseLogger } from "fastify";
import type { ChatResponder } from "../../chat/chatResponder.js";
import type { IntentDetector } from "../../intent/intentDetector.js";
import type { FeatureRegistry } from "../../intent/registry.js";
import { createInferenceState } from "./inferenceState.js";
import type { InferenceRunInput, InferenceRunOutput, InferenceState, InferenceStreamEvent } from "./inferenceTypes.js";
import { Timeline } from "../telemetry/timeline.js";
import { setupAgentContext } from "../nodes/setupAgentContext.js";
import { getHistory } from "../nodes/getHistory.js";
import { getUserMemory } from "../nodes/getUserMemory.js";
import { addUserChat } from "../nodes/addUserChat.js";
import { addAiChat } from "../nodes/addAiChat.js";
import { saveHistory } from "../nodes/saveHistory.js";
import { intentDetect } from "../nodes/intentDetect.js";
import { intentParse } from "../nodes/intentParse.js";
import { checkFallback } from "../nodes/checkFallback.js";
import { executeFeatureFunction } from "../nodes/executeFeatureFunction.js";
import { postProcessing } from "../nodes/postProcessing.js";
import { buildAnswerSystemPrompt, processFinalAnswer } from "../nodes/processFinalAnswer.js";
import { joinResults } from "../nodes/joinResults.js";
import type { FeatureExecutorRegistry } from "../features/registry.js";
import type { HistoryProvider } from "../history/historyProvider.js";
import type { MemoryProvider } from "../memory/memoryProvider.js";
import type { ConversationStore } from "../store/conversationStore.js";

export class InferencePipeline {
  constructor(
    private readonly detector: IntentDetector,
    private readonly responder: ChatResponder,
    private readonly featureRegistry: FeatureRegistry,
    private readonly executorRegistry: FeatureExecutorRegistry,
    private readonly historyProvider: HistoryProvider,
    private readonly memoryProvider: MemoryProvider,
    private readonly conversationStore: ConversationStore,
    private readonly logger?: FastifyBaseLogger
  ) {}

  async run(input: InferenceRunInput): Promise<InferenceRunOutput> {
    const timeline = new Timeline();
    const state = await this.prepareState(input);
    await this.resolveAnswer(state, timeline);
    await addAiChat(state, this.conversationStore);
    await saveHistory(state, this.conversationStore);
    state.timings.totalMs = timeline.total();

    const output = joinResults(state);
    this.logger?.info(
      {
        model: input.model,
        path: output.path,
        timings: output.timings,
        intentStatus: output.intentStatus
      },
      "inference.pipeline.done"
    );
    return output;
  }

  async *stream(input: InferenceRunInput): AsyncGenerator<InferenceStreamEvent, InferenceRunOutput, void> {
    const timeline = new Timeline();
    const state = await this.prepareState(input);
    yield {
      type: "message.start",
      data: { model: input.model }
    };
    const handledByFeature = await this.detectAndMaybeExecuteFeature(state, timeline);
    if (!handledByFeature) {
      timeline.mark("final.start");
      const answerStream = this.responder.streamRespond({
        state: state.normalizedState,
        systemPrompt: buildAnswerSystemPrompt(state)
      });
      while (true) {
        const next = await answerStream.next();
        if (next.done) {
          state.finalAnswer = next.value;
          break;
        }
        if (state.timings.firstChunkMs === undefined) {
          state.timings.firstChunkMs = timeline.total();
        }
        yield {
          type: "message.delta",
          data: { text: next.value.text }
        };
      }
      timeline.mark("final.end");
      state.timings.finalAnswerMs = timeline.duration("final.start", "final.end");
      state.path = "answer_llm";
    } else if (state.finalAnswer) {
      yield {
        type: "message.delta",
        data: { text: state.finalAnswer.answer }
      };
    }

    await addAiChat(state, this.conversationStore);
    await saveHistory(state, this.conversationStore);
    state.timings.totalMs = timeline.total();

    const output = joinResults(state);
    yield {
      type: "message.end",
      data: {
        answer: output.answer,
        modelName: output.modelName,
        finishReason: output.finishReason,
        path: output.path
      }
    };
    if (output.intent) {
      yield {
        type: "intent.result",
        data: output.intent
      };
    } else {
      yield {
        type: "intent.error",
        data: { message: "intent detection failed" }
      };
    }
    yield {
      type: "done",
      data: {
        path: output.path,
        timings: output.timings
      }
    };
    return output;
  }

  async detectIntent(input: InferenceRunInput): Promise<InferenceRunOutput["intent"]> {
    const intent = await this.detector.detect({ state: input.state });
    const matchedFeature = this.featureRegistry.getById(intent.parsed.featureId);
    return {
      parsed: intent.parsed,
      rawResponse: intent.rawResponse,
      matchedFeature: matchedFeature
        ? {
            id: matchedFeature.id,
            title: matchedFeature.title
          }
        : null
    };
  }

  private async prepareState(input: InferenceRunInput): Promise<InferenceState> {
    const state = createInferenceState(input);
    await setupAgentContext(state);
    await getHistory(state, this.historyProvider);
    await getUserMemory(state, this.memoryProvider);
    await addUserChat(state, this.conversationStore);
    return state;
  }

  private async detectAndMaybeExecuteFeature(state: InferenceState, timeline: Timeline): Promise<boolean> {
    try {
      timeline.mark("intent.start");
      const intent = await intentDetect(state, this.detector);
      timeline.mark("intent.end");
      state.timings.intentDetectMs = timeline.duration("intent.start", "intent.end");
      state.intentResult = intent;

      timeline.mark("intent.parse.start");
      state.featureSelection = intentParse(intent, this.featureRegistry.getById(intent.parsed.featureId));
      timeline.mark("intent.parse.end");
      state.timings.intentParseMs = timeline.duration("intent.parse.start", "intent.parse.end");

      if (checkFallback(state.featureSelection)) {
        return false;
      }

      timeline.mark("feature.exec.start");
      const execution = await executeFeatureFunction(state, this.executorRegistry);
      await postProcessing(state, execution);
      timeline.mark("feature.exec.end");
      state.timings.featureExecMs = timeline.duration("feature.exec.start", "feature.exec.end");

      const metadata = execution?.metadata ?? {};
      if (metadata.weatherLookupFailed) {
        this.logger?.warn(
          {
            featureId: state.featureSelection.feature?.id,
            city: metadata.city,
            error: metadata.error,
            locationSource: metadata.locationSource
          },
          "inference.pipeline.feature_execution_failed"
        );
        state.path = "feature_failed";
        return false;
      }

      if (execution?.directResponse) {
        state.finalAnswer = execution.directResponse;
        state.path = "feature_success";
        return true;
      }

      timeline.mark("final.start");
      const finalAnswer = await processFinalAnswer(state, this.responder);
      timeline.mark("final.end");
      state.timings.finalAnswerMs = timeline.duration("final.start", "final.end");
      state.finalAnswer = finalAnswer;
      state.path = "feature_success";
      return true;
    } catch (error) {
      state.path = "feature_failed";
      this.logger?.warn({ error }, "inference.pipeline.feature_path_failed");
      return false;
    }
  }

  private async resolveAnswer(state: InferenceState, timeline: Timeline): Promise<void> {
    const handledByFeature = await this.detectAndMaybeExecuteFeature(state, timeline);
    if (handledByFeature) {
      return;
    }

    timeline.mark("final.start");
    state.finalAnswer = await this.responder.respond({
      state: state.normalizedState,
      systemPrompt: buildAnswerSystemPrompt(state)
    });
    timeline.mark("final.end");
    state.timings.finalAnswerMs = timeline.duration("final.start", "final.end");
    state.path = "answer_llm";
  }
}
