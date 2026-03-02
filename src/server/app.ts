import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z } from "zod";
import { registerDefaultFeatures } from "../features/index.js";
import { IntentDetector } from "../intent/intentDetector.js";
import { getFeatureRegistry } from "../intent/registry.js";
import { buildLoggerOptions } from "./logger.js";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  imageDescription: z.string().optional()
});

const requestSchema = z.object({
  model: z.string().default("openai:gpt-4o-mini"),
  state: z.object({
    messages: z.array(messageSchema).min(1),
    viewerTimezone: z.string().optional(),
    imageDescription: z.string().optional(),
    userMemory: z
      .array(
        z.object({
          key: z.string(),
          content: z.string(),
          targetDate: z.string().optional().nullable()
        })
      )
      .optional(),
    currentFeature: z.object({ id: z.string() }).optional()
  })
});

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
                      legacyId: { type: ["string", "null"] },
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
              error: { type: "string" },
              details: { type: "array", items: { type: "object" } }
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
      const parsed = requestSchema.safeParse(request.body);

      if (!parsed.success) {
        request.log.warn(
          {
            issueCount: parsed.error.issues.length
          },
          "intent.api.invalid_request"
        );
        return reply.status(400).send({
          error: "invalid_request",
          details: parsed.error.issues
        });
      }

      const messages = parsed.data.state.messages;
      const lastMessage = messages[messages.length - 1];
      request.log.info(
        {
          model: parsed.data.model,
          messageCount: messages.length,
          lastRole: lastMessage?.role,
          lastContentPreview: (lastMessage?.content ?? "").slice(0, 120)
        },
        "intent.api.request"
      );

      try {
        const detector = new IntentDetector(registry, parsed.data.model, request.log);
        const result = await detector.detect({
          state: parsed.data.state
        });

        const matchedFeature = registry.resolve(result.parsed.featureId);
        const canonicalFeatureId = matchedFeature?.id ?? result.parsed.featureId;
        const elapsedMs = Date.now() - startAt;
        request.log.info(
          {
            model: parsed.data.model,
            featureId: canonicalFeatureId,
            elapsedMs
          },
          "intent.api.response"
        );

        return {
          parsed: {
            ...result.parsed,
            featureId: canonicalFeatureId
          },
          rawResponse: result.rawResponse,
          matchedFeature: matchedFeature
            ? {
                id: matchedFeature.id,
                legacyId: matchedFeature.legacyId ?? null,
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
