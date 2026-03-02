import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { FastifyBaseLogger } from "fastify";
import type { ChatState } from "../types/chat.js";
import type { Feature } from "./feature.js";
import { parseIntentDetectResult, type IntentDetectResult } from "./intentResult.js";
import { createChatModel } from "./modelFactory.js";
import { PromptMaker, ConversationContextMaker } from "./promptMaker.js";
import type { FeatureRegistry } from "./registry.js";

export interface IntentDetectionInput {
  state: ChatState;
  additionalFeatures?: Feature[];
}

export interface IntentDetectionOutput {
  rawResponse: string;
  parsed: IntentDetectResult;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.INTENT_DETECT_TIMEOUT_MS ?? 4500);
const DEFAULT_RETRY_COUNT = Number(process.env.INTENT_DETECT_RETRY_COUNT ?? 1);

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
    this.logger?.debug(
      {
        model: this.modelName,
        messageCount: input.state.messages.length
      },
      "intent.detect.start"
    );

    const model = await createChatModel({ model: this.modelName, temperature: 0 });
    const prompt = this.promptMaker.getIntentDetectionPrompt(input.additionalFeatures ?? []);
    const context = new ConversationContextMaker(input.state).getConversationContext();
    const messages = [new SystemMessage(prompt), new HumanMessage(context)];
    const startedAt = Date.now();
    let rawResponse = "";
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= DEFAULT_RETRY_COUNT) {
      attempt += 1;
      try {
        const response = await this.invokeWithTimeout(model as { invoke: (input: unknown, options?: unknown) => Promise<{ content: unknown }> }, messages, DEFAULT_TIMEOUT_MS);
        rawResponse = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
        break;
      } catch (error) {
        lastError = error;
        this.logger?.warn(
          {
            model: this.modelName,
            attempt,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            err: error
          },
          "intent.detect.retry"
        );
      }
    }

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

    this.logger?.debug(
      {
        model: this.modelName,
        featureId: output.parsed.featureId,
        elapsedMs: Date.now() - startedAt,
        attemptCount: attempt,
        fallbackApplied: rawResponse.length === 0
      },
      "intent.detect.done"
    );

    if (rawResponse.length === 0) {
      this.logger?.error(
        {
          model: this.modelName,
          attemptCount: attempt,
          err: lastError
        },
        "intent.detect.fallback"
      );
    }

    return output;
  }

  private async invokeWithTimeout(
    model: { invoke: (input: unknown, options?: unknown) => Promise<{ content: unknown }> },
    input: unknown,
    timeoutMs: number
  ): Promise<{ content: unknown }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await model.invoke(input, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}
