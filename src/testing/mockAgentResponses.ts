import type { FastifyRequest } from "fastify";
import type { InferenceRunOutput, InferenceStreamEvent } from "../inference/pipeline/inferenceTypes.js";

export type MockScenario =
  | "plain_answer"
  | "weather_success"
  | "feature_failed"
  | "intent_error"
  | "stream_error";

export type MockStreamEvent =
  | InferenceStreamEvent
  | { type: "error"; data: { code?: string; message: string; requestId?: string } };

const DEFAULT_SCENARIO: MockScenario = "plain_answer";

const isMockScenario = (value: string): value is MockScenario =>
  value === "plain_answer" ||
  value === "weather_success" ||
  value === "feature_failed" ||
  value === "intent_error" ||
  value === "stream_error";

const getHeaderString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const resolveMockScenario = (request: FastifyRequest): MockScenario | null => {
  const headerValue = getHeaderString(
    request.headers["x-agent-mock-scenario"] as string | string[] | undefined
  )?.trim();
  if (headerValue && isMockScenario(headerValue)) {
    return headerValue;
  }

  const mockMode = process.env.AGENT_MOCK_MODE === "true";
  if (!mockMode) {
    return null;
  }

  const envScenario = (process.env.AGENT_MOCK_SCENARIO ?? DEFAULT_SCENARIO).trim();
  return isMockScenario(envScenario) ? envScenario : DEFAULT_SCENARIO;
};

const baseUsage = {
  promptTokens: 120,
  completionTokens: 48,
  totalTokens: 168
};

const plainAnswer = (model: string): InferenceRunOutput => ({
  answer: "안녕하세요. 현재는 mock 응답으로 동작 중입니다.",
  modelName: model,
  finishReason: "STOP",
  usage: baseUsage,
  intent: null,
  intentStatus: "failed",
  path: "answer_llm",
  timings: {
    totalMs: 320,
    intentDetectMs: 120,
    finalAnswerMs: 180,
    firstChunkMs: 80
  }
});

const weatherSuccess = (model: string): InferenceRunOutput => ({
  answer:
    "용인시 기준 현재 날씨는 맑음, 25도입니다. 오늘 최고 기온은 30도, 최저 기온은 20도로 예상됩니다.",
  modelName: "feature-executor",
  finishReason: "STOP",
  usage: baseUsage,
  intent: {
    parsed: {
      featureId: "weather.lookup",
      reasoning: "The user is asking for weather information.",
      parameters: {
        city: "Yongin"
      }
    },
    rawResponse:
      "<reasoning>The user is asking for weather information.</reasoning><feature>weather.lookup</feature><parameters><city>Yongin</city></parameters>",
    matchedFeature: {
      id: "weather.lookup",
      title: "Provide weather information"
    }
  },
  intentStatus: "ok",
  path: "feature_success",
  timings: {
    totalMs: 640,
    intentDetectMs: 180,
    featureExecMs: 220,
    finalAnswerMs: 0,
    firstChunkMs: 60
  }
});

const featureFailed = (model: string): InferenceRunOutput => ({
  answer: "죄송합니다. 현재 실시간 날씨 정보를 가져올 수 없습니다.",
  modelName: model,
  finishReason: "STOP",
  usage: baseUsage,
  intent: {
    parsed: {
      featureId: "weather.lookup",
      reasoning: "The user is asking for weather information.",
      parameters: {
        city: "Yongin"
      }
    },
    rawResponse:
      "<reasoning>The user is asking for weather information.</reasoning><feature>weather.lookup</feature><parameters><city>Yongin</city></parameters>",
    matchedFeature: {
      id: "weather.lookup",
      title: "Provide weather information"
    }
  },
  intentStatus: "ok",
  path: "feature_failed",
  timings: {
    totalMs: 920,
    intentDetectMs: 210,
    featureExecMs: 330,
    finalAnswerMs: 260,
    firstChunkMs: 90
  }
});

const intentError = (model: string): InferenceRunOutput => ({
  answer: "안녕하세요. 인텐트 감지는 실패했지만 일반 답변 경로로 응답했습니다.",
  modelName: model,
  finishReason: "STOP",
  usage: baseUsage,
  intent: null,
  intentStatus: "failed",
  path: "answer_llm",
  timings: {
    totalMs: 540,
    intentDetectMs: 450,
    finalAnswerMs: 70,
    firstChunkMs: 75
  }
});

const streamErrorOutput = (model: string): InferenceRunOutput => ({
  answer: "stream error",
  modelName: model,
  finishReason: "ERROR",
  usage: baseUsage,
  intent: null,
  intentStatus: "failed",
  path: "answer_llm",
  timings: {
    totalMs: 180,
    firstChunkMs: 40
  }
});

export const buildMockReplyWithIntent = (model: string, scenario: MockScenario): InferenceRunOutput => {
  switch (scenario) {
    case "weather_success":
      return weatherSuccess(model);
    case "feature_failed":
      return featureFailed(model);
    case "intent_error":
      return intentError(model);
    case "stream_error":
      return streamErrorOutput(model);
    case "plain_answer":
    default:
      return plainAnswer(model);
  }
};

export const buildMockReply = (model: string, scenario: MockScenario) => {
  const output = buildMockReplyWithIntent(model, scenario);
  return {
    answer: output.answer,
    modelName: output.modelName,
    finishReason: output.finishReason,
    usage: output.usage
  };
};

export const buildMockIntent = (model: string, scenario: MockScenario) => {
  const output = buildMockReplyWithIntent(model, scenario);
  if (output.intent) {
    return output.intent;
  }

  return {
    parsed: {
      featureId: "0",
      reasoning: "mock fallback intent"
    },
    rawResponse: "",
    matchedFeature: null
  };
};

export const buildMockStreamEvents = (
  model: string,
  scenario: MockScenario,
  requestId?: string
): MockStreamEvent[] => {
  const output = buildMockReplyWithIntent(model, scenario);

  if (scenario === "stream_error") {
    return [
      { type: "message.start", data: { model } },
      { type: "message.delta", data: { text: "mock stream started" } },
      {
        type: "error",
        data: {
          code: "AGENT_UNAVAILABLE",
          message: "mock stream processing failed",
          requestId
        }
      }
    ];
  }

  const events: MockStreamEvent[] = [
    { type: "message.start", data: { model } },
    { type: "message.delta", data: { text: output.answer } },
    {
      type: "message.end",
      data: {
        answer: output.answer,
        modelName: output.modelName,
        finishReason: output.finishReason,
        path: output.path
      }
    }
  ];

  if (output.intent) {
    events.push({ type: "intent.result", data: output.intent });
  } else {
    events.push({ type: "intent.error", data: { message: "intent detection failed" } });
  }

  events.push({
    type: "done",
    data: {
      path: output.path,
      timings: output.timings
    }
  });

  return events;
};
