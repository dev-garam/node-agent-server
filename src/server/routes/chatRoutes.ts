import type { FastifyInstance } from "fastify";
import { buildErrorResponse } from "../errors.js";
import { parseChatReplyRequestBody } from "../parsers.js";
import type { ServerServices } from "../services.js";

export const registerChatRoutes = (app: FastifyInstance, services: ServerServices): void => {
  app.post(
    "/api/v1/chat/reply",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Chat"],
        summary: "최종 답변 생성",
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
          required: ["session", "state"],
          properties: {
            model: { type: "string", default: "openai:gpt-4o-mini" },
            session: {
              type: "object",
              required: ["id", "userId", "tenantId", "serviceId"],
              properties: {
                id: { type: "string" },
                userId: { type: "string" },
                tenantId: { type: "string" },
                serviceId: { type: "string" }
              }
            },
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
              answer: { type: "string" },
              modelName: { type: "string" },
              finishReason: { type: "string" },
              usage: {
                type: "object",
                properties: {
                  promptTokens: { type: "number" },
                  completionTokens: { type: "number" },
                  totalTokens: { type: "number" }
                }
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
      const parsed = parseChatReplyRequestBody(request.body);
      if (!parsed.ok) {
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
      }

      try {
        const responder = services.getResponder(parsed.data.model);
        return await responder.respond({
          state: parsed.data.state
        });
      } catch (error) {
        request.log.error({ model: parsed.data.model, error }, "chat.reply.error");
        return reply
          .status(500)
          .send(buildErrorResponse(request.id, "AGENT_UNAVAILABLE", "agent dependency is unavailable"));
      }
    }
  );
};
