import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { registerDefaultFeatures } from "../features/index.js";
import { IntentDetector } from "../intent/intentDetector.js";
import { getFeatureRegistry } from "../intent/registry.js";
import type { ChatState, InStateChatMessage, UserMemory } from "../types/chat.js";
import { buildLoggerOptions } from "./logger.js";

const DEFAULT_MODEL = process.env.INTENT_DETECT_DEFAULT_MODEL ?? "openai:gpt-4o-mini";

interface ParsedIntentRequest {
  model: string;
  state: ChatState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseMessage = (value: unknown): InStateChatMessage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const role = value.role;
  const content = value.content;
  if ((role !== "user" && role !== "assistant") || typeof content !== "string" || content.length === 0) {
    return undefined;
  }

  return {
    role,
    content,
    imageDescription: typeof value.imageDescription === "string" ? value.imageDescription : undefined
  };
};

const parseUserMemory = (value: unknown): UserMemory[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed: UserMemory[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== "string" || typeof item.content !== "string") {
      continue;
    }
    parsed.push({
      key: item.key,
      content: item.content,
      targetDate: typeof item.targetDate === "string" || item.targetDate === null ? item.targetDate : undefined
    });
  }
  return parsed;
};

const parseIntentRequestBody = (body: unknown): { ok: true; data: ParsedIntentRequest } | { ok: false; error: string } => {
  if (!isRecord(body) || !isRecord(body.state)) {
    return { ok: false, error: "invalid_state" };
  }

  const messagesRaw = body.state.messages;
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
    return { ok: false, error: "invalid_messages" };
  }

  const messages: InStateChatMessage[] = [];
  for (const raw of messagesRaw) {
    const parsedMessage = parseMessage(raw);
    if (!parsedMessage) {
      return { ok: false, error: "invalid_message_item" };
    }
    messages.push(parsedMessage);
  }

  const state: ChatState = {
    messages
  };

  if (typeof body.state.viewerTimezone === "string") {
    state.viewerTimezone = body.state.viewerTimezone;
  }
  if (typeof body.state.imageDescription === "string") {
    state.imageDescription = body.state.imageDescription;
  }
  if (isRecord(body.state.currentFeature) && typeof body.state.currentFeature.id === "string") {
    state.currentFeature = { id: body.state.currentFeature.id };
  }
  const userMemory = parseUserMemory(body.state.userMemory);
  if (userMemory && userMemory.length > 0) {
    state.userMemory = userMemory;
  }

  const model = typeof body.model === "string" && body.model.length > 0 ? body.model : DEFAULT_MODEL;
  return {
    ok: true,
    data: {
      model,
      state
    }
  };
};

export const buildApp = async () => {
  const app = Fastify({
    logger: buildLoggerOptions(),
    disableRequestLogging: true
  });

  await app.register(cors, {
    origin: true
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Node Agent Server API",
        description: "Intent detection API for the agent server",
        version: "0.1.0"
      }
    }
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  const registry = getFeatureRegistry();
  registerDefaultFeatures(registry);
  const detectorCache = new Map<string, IntentDetector>();
  const getDetector = (modelName: string) => {
    let detector = detectorCache.get(modelName);
    if (!detector) {
      detector = new IntentDetector(registry, modelName, app.log);
      detectorCache.set(modelName, detector);
    }
    return detector;
  };

  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Health check",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" }
            }
          }
        }
      }
    },
    async () => ({ status: "ok" })
  );

  app.post(
    "/api/v1/intent/detect",
    {
      schema: {
        tags: ["Intent"],
        summary: "Detect intent from chat state",
        body: {
          type: "object",
          required: ["state"],
          properties: {
            model: { type: "string", default: "openai:gpt-4o-mini" },
            state: {
              type: "object",
              required: ["messages"],
              properties: {
                messages: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    required: ["role", "content"],
                    properties: {
                      role: { type: "string", enum: ["user", "assistant"] },
                      content: { type: "string" },
                      imageDescription: { type: "string" }
                    }
                  }
                },
                viewerTimezone: { type: "string" },
                imageDescription: { type: "string" },
                userMemory: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["key", "content"],
                    properties: {
                      key: { type: "string" },
                      content: { type: "string" },
                      targetDate: { type: ["string", "null"] }
                    }
                  }
                },
                currentFeature: {
                  type: "object",
                  required: ["id"],
                  properties: {
                    id: { type: "string" }
                  }
                }
              }
            }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              parsed: { type: "object" },
              rawResponse: { type: "string" },
              matchedFeature: {
                anyOf: [
                  {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" }
                    }
                  },
                  { type: "null" }
                ]
              }
            }
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" }
            }
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const startAt = Date.now();
      const parsed = parseIntentRequestBody(request.body);

      if (!parsed.ok) {
        request.log.warn(
          {
            error: parsed.error
          },
          "intent.api.invalid_request"
        );
        return reply.status(400).send({
          error: "invalid_request"
        });
      }

      const messages = parsed.data.state.messages;
      const lastMessage = messages[messages.length - 1];
      request.log.debug(
        {
          model: parsed.data.model,
          messageCount: messages.length,
          lastRole: lastMessage?.role
        },
        "intent.api.request"
      );

      try {
        const detector = getDetector(parsed.data.model);
        const result = await detector.detect({
          state: parsed.data.state
        });

        const matchedFeature = registry.getById(result.parsed.featureId);
        const elapsedMs = Date.now() - startAt;
        request.log.info(
          {
            model: parsed.data.model,
            featureId: result.parsed.featureId,
            elapsedMs
          },
          "intent.api.response"
        );

        return {
          parsed: result.parsed,
          rawResponse: result.rawResponse,
          matchedFeature: matchedFeature
            ? {
                id: matchedFeature.id,
                title: matchedFeature.title
              }
            : null
        };
      } catch (error) {
        const elapsedMs = Date.now() - startAt;
        request.log.error(
          {
            model: parsed.data.model,
            elapsedMs,
            error
          },
          "intent.api.error"
        );
        return reply.status(500).send({
          error: "intent_detection_failed"
        });
      }
    }
  );

  return app;
};
