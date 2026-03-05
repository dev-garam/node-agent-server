import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { inspect } from "node:util";
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

export interface ChatStreamChunk {
  text: string;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.CHAT_RESPOND_TIMEOUT_MS ?? 8000);
const LOG_PREVIEW_CHARS = 500;
const LOG_MODEL_IO_MAX_CHARS = 12000;

const previewText = (value: string): string => {
  const limit = Number.isFinite(LOG_PREVIEW_CHARS) && LOG_PREVIEW_CHARS > 0 ? Math.floor(LOG_PREVIEW_CHARS) : 400;
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...(truncated ${value.length - limit} chars)`;
};

const sanitizeAnswer = (text: string): string => text.trim();

const stringifyForLog = (value: unknown): string => {
  const maxChars = LOG_MODEL_IO_MAX_CHARS;
  const text = inspect(value, { depth: 6, compact: false, breakLength: 120, maxArrayLength: 60 });
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

const serializeMessagesForLog = (messages: Array<SystemMessage | HumanMessage | AIMessage>) =>
  messages.map((msg) => {
    const type =
      msg instanceof SystemMessage ? "system" : msg instanceof HumanMessage ? "user" : "assistant";
    return { type, content: msg.content };
  });

const contentToText = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item && typeof (item as { text?: unknown }).text === "string") {
          return (item as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
};

export class ChatResponder {
  constructor(
    private readonly modelName: string,
    private readonly logger?: FastifyBaseLogger
  ) {}

  async respond(input: ChatRespondInput): Promise<ChatRespondOutput> {
    const logDebug = isLevelEnabled(this.logger, "debug");
    const logTrace = isLevelEnabled(this.logger, "trace");
    const startedAt = Date.now();
    const model = await createChatModel({ model: this.modelName, temperature: 0.4 });
    const modelReadyAt = Date.now();

    const messageBuildStartedAt = Date.now();
    const messages = [] as Array<SystemMessage | HumanMessage | AIMessage>;
    if (input.systemPrompt && input.systemPrompt.length > 0) {
      messages.push(new SystemMessage(input.systemPrompt));
    }

    const boundedMessages = input.state.messages;
    if (logDebug) {
      const lastUserMessage = [...boundedMessages].reverse().find((msg) => msg.role === "user");
      this.logger?.debug(
        {
          model: this.modelName,
          inputMessageCount: boundedMessages.length,
          lastUserMessagePreview: lastUserMessage ? previewText(lastUserMessage.content) : undefined
        },
        "chat.respond.input.preview"
      );
    }

    for (const message of boundedMessages) {
      const safeContent = message.content;
      if (message.role === "user") {
        messages.push(new HumanMessage(safeContent));
      } else {
        messages.push(new AIMessage(safeContent));
      }
    }
    const messageBuildMs = Date.now() - messageBuildStartedAt;

    const attemptStartedAt = Date.now();
    try {
      if (logTrace) {
        this.logger?.trace(
          `chat.model.invoke.request\n${stringifyForLog({
            model: this.modelName,
            attempt: 1,
            timeoutMs: DEFAULT_TIMEOUT_MS,
            messages: serializeMessagesForLog(messages)
          })}`
        );
      }
      const response = await this.invokeWithTimeout(
        model as { invoke: (input: unknown, options?: unknown) => Promise<{ content: unknown }> },
        messages,
        DEFAULT_TIMEOUT_MS
      );
      if (logTrace) {
        this.logger?.trace(`chat.model.invoke.response\n${stringifyForLog(response)}`);
      }
      const invokedAt = Date.now();

      const responseText =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      const normalizedAnswer = sanitizeAnswer(responseText);

      const responseAny = response as {
        content: unknown;
        response_metadata?: { finish_reason?: string };
        usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };

      const output: ChatRespondOutput = {
        answer: normalizedAnswer,
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
          attemptCount: 1,
          modelInitMs: modelReadyAt - startedAt,
          messageBuildMs,
          invokeMs: Date.now() - attemptStartedAt,
          postProcessMs: Date.now() - invokedAt,
          latencyMs: Date.now() - startedAt,
          inputMessageCount: boundedMessages.length,
          rawAnswerLength: responseText.length,
          normalizedAnswerLength: normalizedAnswer.length
        },
        "chat.respond.done"
      );

      if (logDebug) {
        this.logger?.debug(
          {
            model: this.modelName,
            rawAnswerPreview: previewText(responseText),
            normalizedAnswerPreview: previewText(normalizedAnswer)
          },
          "chat.respond.output.preview"
        );
      }

      return output;
    } catch (error) {
      this.logger?.error(
        {
          model: this.modelName,
          attemptCount: 1,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          modelInitMs: modelReadyAt - startedAt,
          messageBuildMs,
          invokeMs: Date.now() - attemptStartedAt,
          elapsedMs: Date.now() - startedAt,
          err: error
        },
        "chat.respond.failed"
      );
      throw error;
    }
  }

  async *streamRespond(input: ChatRespondInput): AsyncGenerator<ChatStreamChunk, ChatRespondOutput, void> {
    const logDebug = isLevelEnabled(this.logger, "debug");
    const logTrace = isLevelEnabled(this.logger, "trace");
    const startedAt = Date.now();
    const model = await createChatModel({ model: this.modelName, temperature: 0.4 });
    const modelReadyAt = Date.now();

    const messageBuildStartedAt = Date.now();
    const messages = [] as Array<SystemMessage | HumanMessage | AIMessage>;
    if (input.systemPrompt && input.systemPrompt.length > 0) {
      messages.push(new SystemMessage(input.systemPrompt));
    }

    const boundedMessages = input.state.messages;
    if (logDebug) {
      const lastUserMessage = [...boundedMessages].reverse().find((msg) => msg.role === "user");
      this.logger?.debug(
        {
          model: this.modelName,
          inputMessageCount: boundedMessages.length,
          lastUserMessagePreview: lastUserMessage ? previewText(lastUserMessage.content) : undefined
        },
        "chat.respond.input.preview"
      );
    }

    for (const message of boundedMessages) {
      if (message.role === "user") {
        messages.push(new HumanMessage(message.content));
      } else {
        messages.push(new AIMessage(message.content));
      }
    }
    const messageBuildMs = Date.now() - messageBuildStartedAt;

    const attemptStartedAt = Date.now();
    let fullText = "";
    try {
      if (logTrace) {
        this.logger?.trace(
          `chat.model.stream.request\n${stringifyForLog({
            model: this.modelName,
            attempt: 1,
            messages: serializeMessagesForLog(messages)
          })}`
        );
      }

      const modelWithStream = model as {
        stream: (inputValue: unknown, options?: unknown) => Promise<AsyncIterable<{ content: unknown }>>;
      };
      const stream = await modelWithStream.stream(messages);
      for await (const chunk of stream) {
        const text = contentToText(chunk.content);
        if (text.length === 0) {
          continue;
        }
        fullText += text;
        yield { text };
      }

      const normalizedAnswer = sanitizeAnswer(fullText);
      const output: ChatRespondOutput = {
        answer: normalizedAnswer,
        modelName: this.modelName
      };

      this.logger?.info(
        {
          model: this.modelName,
          attemptCount: 1,
          modelInitMs: modelReadyAt - startedAt,
          messageBuildMs,
          invokeMs: Date.now() - attemptStartedAt,
          latencyMs: Date.now() - startedAt,
          inputMessageCount: boundedMessages.length,
          rawAnswerLength: fullText.length,
          normalizedAnswerLength: normalizedAnswer.length
        },
        "chat.respond.stream.done"
      );

      if (logDebug) {
        this.logger?.debug(
          {
            model: this.modelName,
            rawAnswerPreview: previewText(fullText),
            normalizedAnswerPreview: previewText(normalizedAnswer)
          },
          "chat.respond.stream.output.preview"
        );
      }

      return output;
    } catch (error) {
      this.logger?.error(
        {
          model: this.modelName,
          attemptCount: 1,
          modelInitMs: modelReadyAt - startedAt,
          messageBuildMs,
          invokeMs: Date.now() - attemptStartedAt,
          elapsedMs: Date.now() - startedAt,
          err: error
        },
        "chat.respond.stream.failed"
      );
      throw error;
    }
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
