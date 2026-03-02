import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { FastifyBaseLogger } from "fastify";
import type { ChatState } from "../types/chat.js";
import { createChatModel } from "../intent/modelFactory.js";

export interface ChatRespondInput {
  state: ChatState;
  systemPrompt?: string;
}

export interface ChatRespondOutput {
  answer: string;
  modelName?: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

const DEFAULT_TIMEOUT_MS = Number(process.env.CHAT_RESPOND_TIMEOUT_MS ?? 8000);
const DEFAULT_RETRY_COUNT = Number(process.env.CHAT_RESPOND_RETRY_COUNT ?? 1);

export class ChatResponder {
  constructor(
    private readonly modelName: string,
    private readonly logger?: FastifyBaseLogger
  ) {}

  async respond(input: ChatRespondInput): Promise<ChatRespondOutput> {
    const startedAt = Date.now();
    const model = await createChatModel({ model: this.modelName, temperature: 0.4 });

    const messages = [] as Array<SystemMessage | HumanMessage | AIMessage>;
    if (input.systemPrompt && input.systemPrompt.length > 0) {
      messages.push(new SystemMessage(input.systemPrompt));
    }

    for (const message of input.state.messages) {
      if (message.role === "user") {
        messages.push(new HumanMessage(message.content));
      } else {
        messages.push(new AIMessage(message.content));
      }
    }

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= DEFAULT_RETRY_COUNT) {
      attempt += 1;
      try {
        const response = await this.invokeWithTimeout(
          model as { invoke: (input: unknown, options?: unknown) => Promise<{ content: unknown }> },
          messages,
          DEFAULT_TIMEOUT_MS
        );

        const responseText =
          typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content);

        const responseAny = response as {
          content: unknown;
          response_metadata?: { finish_reason?: string };
          usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
        };

        const output: ChatRespondOutput = {
          answer: responseText,
          modelName: this.modelName,
          finishReason: responseAny.response_metadata?.finish_reason,
          usage: responseAny.usage_metadata
            ? {
                promptTokens: responseAny.usage_metadata.input_tokens,
                completionTokens: responseAny.usage_metadata.output_tokens,
                totalTokens: responseAny.usage_metadata.total_tokens
              }
            : undefined
        };

        this.logger?.info(
          {
            model: this.modelName,
            attemptCount: attempt,
            latencyMs: Date.now() - startedAt
          },
          "chat.respond.done"
        );

        return output;
      } catch (error) {
        lastError = error;
        this.logger?.warn(
          {
            model: this.modelName,
            attempt,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            err: error
          },
          "chat.respond.retry"
        );
      }
    }

    this.logger?.error(
      {
        model: this.modelName,
        attemptCount: attempt,
        err: lastError
      },
      "chat.respond.failed"
    );

    return {
      answer: "",
      modelName: this.modelName,
      finishReason: "error"
    };
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
