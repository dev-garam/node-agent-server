import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { inspect } from "node:util";
import type { FastifyBaseLogger } from "fastify";
import type { ChatState } from "../types/chat.js";
import type { Feature } from "./feature.js";
import { parseIntentDetectResult, type IntentDetectResult } from "./intentResult.js";
import { createChatModel, resolveModelConfig } from "./modelFactory.js";
import { PromptMaker, ConversationContextMaker } from "./promptMaker.js";
import type { FeatureRegistry } from "./registry.js";
import { getOrCreateGeminiPromptCache } from "./geminiPromptCache.js";

export interface IntentDetectionInput {
  state: ChatState;
  additionalFeatures?: Feature[];
}

export interface IntentDetectionOutput {
  rawResponse: string;
  parsed: IntentDetectResult;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.INTENT_DETECT_TIMEOUT_MS ?? 4500);
const ALLOW_FALLBACK = process.env.INTENT_DETECT_ALLOW_FALLBACK === "true";
const LOG_PREVIEW_CHARS = 700;
const LOG_MODEL_IO_MAX_CHARS = 14000;

const previewText = (value: string): string => {
  const limit = Number.isFinite(LOG_PREVIEW_CHARS) && LOG_PREVIEW_CHARS > 0 ? Math.floor(LOG_PREVIEW_CHARS) : 500;
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...(truncated ${value.length - limit} chars)`;
};

const stringifyForLog = (value: unknown): string => {
  const maxChars = LOG_MODEL_IO_MAX_CHARS;
  const text = inspect(value, { depth: 6, compact: false, breakLength: 120, maxArrayLength: 80 });
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n... (truncated ${text.length - maxChars} chars)`;
};

const isLevelEnabled = (logger: FastifyBaseLogger | undefined, level: "debug" | "trace"): boolean => {
  const candidate = logger as unknown as { isLevelEnabled?: (l: string) => boolean };
  if (typeof candidate?.isLevelEnabled === "function") {
    return candidate.isLevelEnabled(level);
  }
  return true;
};

export class IntentDetector {
  private readonly promptMaker: PromptMaker;

  constructor(
    private readonly registry: FeatureRegistry,
    private readonly modelName: string,
    private readonly logger?: FastifyBaseLogger
  ) {
    this.promptMaker = new PromptMaker(this.registry);
  }

  async detect(input: IntentDetectionInput): Promise<IntentDetectionOutput> {
    const logDebug = isLevelEnabled(this.logger, "debug");
    const logTrace = isLevelEnabled(this.logger, "trace");
    const startedAt = Date.now();
    this.logger?.debug(
      {
        model: this.modelName,
        messageCount: input.state.messages.length
      },
      "intent.detect.start"
    );

    const model = await createChatModel({ model: this.modelName, temperature: 0 });
    const modelReadyAt = Date.now();
    const promptBuildStartedAt = Date.now();
    const prompt = this.promptMaker.getIntentDetectionPrompt(input.additionalFeatures ?? []);
    const context = new ConversationContextMaker(input.state).getConversationContext();
    const fullPromptMessages = [new SystemMessage(prompt), new HumanMessage(context)];
    const contextOnlyMessages = [new HumanMessage(context)];
    const promptBuildMs = Date.now() - promptBuildStartedAt;
    const resolvedModel = resolveModelConfig(this.modelName);

    let cacheName: string | null = null;
    const cacheStartedAt = Date.now();
    if (resolvedModel.modelProvider === "google-genai" && resolvedModel.apiKey) {
      cacheName = await getOrCreateGeminiPromptCache({
        apiKey: resolvedModel.apiKey,
        model: resolvedModel.model,
        prompt,
        logger: this.logger
      });
    }
    const cacheMs = Date.now() - cacheStartedAt;
    let rawResponse = "";
    const attemptStartedAt = Date.now();
    try {
      if (logTrace) {
        this.logger?.trace(
          `intent.model.invoke.request\n${stringifyForLog({
            model: this.modelName,
            attempt: 1,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            cacheName,
            systemPrompt: prompt,
            conversationContext: context
          })}`
        );
      }
      let response: { content: unknown };
      if (cacheName) {
        try {
          response = await this.invokeWithTimeout(
            model as { invoke: (input: unknown, options?: unknown) => Promise<{ content: unknown }> },
            contextOnlyMessages,
            DEFAULT_TIMEOUT_MS,
            { cachedContent: cacheName, cached_content: cacheName }
          );
        } catch (cachedInvokeError) {
          this.logger?.warn(
            { model: this.modelName, cacheName, err: cachedInvokeError },
            "intent.cache.invoke_failed_fallback_full_prompt"
          );
          response = await this.invokeWithTimeout(
            model as { invoke: (input: unknown, options?: unknown) => Promise<{ content: unknown }> },
            fullPromptMessages,
            DEFAULT_TIMEOUT_MS
          );
        }
      } else {
        response = await this.invokeWithTimeout(
          model as { invoke: (input: unknown, options?: unknown) => Promise<{ content: unknown }> },
          fullPromptMessages,
          DEFAULT_TIMEOUT_MS
        );
      }
      if (logTrace) {
        this.logger?.trace(`intent.model.invoke.response\n${stringifyForLog(response)}`);
      }
      rawResponse = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    } catch (error) {
      this.logger?.error(
        {
          model: this.modelName,
          attemptCount: 1,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          modelInitMs: modelReadyAt - startedAt,
          promptBuildMs,
          cacheMs,
          cacheUsed: Boolean(cacheName),
          invokeMs: Date.now() - attemptStartedAt,
          elapsedMs: Date.now() - startedAt,
          err: error
        },
        "intent.detect.failed"
      );

      if (!ALLOW_FALLBACK) {
        throw error;
      }
    }

    if (rawResponse.length === 0) {
      this.logger?.error(
        {
          model: this.modelName,
          attemptCount: 1,
          modelInitMs: modelReadyAt - startedAt,
          promptBuildMs,
          cacheMs,
          cacheUsed: Boolean(cacheName),
          elapsedMs: Date.now() - startedAt,
          err: "empty_intent_response"
        },
        "intent.detect.fallback"
      );

      if (!ALLOW_FALLBACK) {
        throw new Error("intent detection returned empty response");
      }
    }

    const parseStartedAt = Date.now();
    const output =
      rawResponse.length > 0
        ? {
            rawResponse,
            parsed: parseIntentDetectResult(rawResponse)
          }
        : {
            rawResponse: "",
            parsed: {
              featureId: "0",
              reasoning: "intent detection failed and fallback applied"
            }
          };
    const parseResultMs = Date.now() - parseStartedAt;

    if (logDebug && rawResponse.length > 0) {
      this.logger?.debug(
        {
          model: this.modelName,
          rawIntentPreview: previewText(rawResponse),
          parsedFeatureId: output.parsed.featureId,
          parsedParameters: output.parsed.parameters,
          parsedOptions: output.parsed.options
        },
        "intent.detect.output.preview"
      );
    }

    this.logger?.debug(
      {
        model: this.modelName,
        featureId: output.parsed.featureId,
        modelInitMs: modelReadyAt - startedAt,
        promptBuildMs,
        cacheMs,
        cacheUsed: Boolean(cacheName),
        parseResultMs,
        elapsedMs: Date.now() - startedAt,
        attemptCount: 1,
        fallbackApplied: rawResponse.length === 0
      },
      "intent.detect.done"
    );

    return output;
  }

  private async invokeWithTimeout(
    model: { invoke: (input: unknown, options?: unknown) => Promise<{ content: unknown }> },
    input: unknown,
    timeoutMs: number,
    invokeOptions?: Record<string, unknown>
  ): Promise<{ content: unknown }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await model.invoke(input, { signal: controller.signal, ...(invokeOptions ?? {}) });
    } finally {
      clearTimeout(timeout);
    }
  }
}
