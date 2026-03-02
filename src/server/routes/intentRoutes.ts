import type { FastifyInstance } from "fastify";
import { buildErrorResponse } from "../errors.js";
import { parseIntentRequestBody } from "../parsers.js";
import type { ServerServices } from "../services.js";

export const registerIntentRoutes = (app: FastifyInstance, services: ServerServices): void => {
  app.post(
    "/api/v1/intent/detect",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Intent"],
        summary: "인텐트 감지 (호환용 폴백)",
        headers: {
          type: "object",
          required: ["x-key-id", "x-timestamp", "x-nonce", "x-signature"],
          properties: {
            "x-key-id": { type: "string" },
            "x-timestamp": { type: "string" },
            "x-nonce": { type: "string" },
            "x-signature": { type: "string" }
          }
        },
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
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" }
            }
          },
          401: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" }
            }
          },
          500: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const startAt = Date.now();
      const parsed = parseIntentRequestBody(request.body);

      if (!parsed.ok) {
        request.log.warn({ error: parsed.error }, "intent.api.invalid_request");
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
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
        const detector = services.getDetector(parsed.data.model);
        const result = await detector.detect({
          state: parsed.data.state
        });

        const matchedFeature = services.registry.getById(result.parsed.featureId);
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
        return reply
          .status(500)
          .send(buildErrorResponse(request.id, "AGENT_UNAVAILABLE", "agent dependency is unavailable"));
      }
    }
  );
};
