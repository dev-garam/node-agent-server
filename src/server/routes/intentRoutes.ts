import type { FastifyInstance } from "fastify";
import { buildErrorResponse } from "../errors.js";
import { getProviderRateLimit } from "../providerError.js";
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
          description: "HMAC 활성화 시 헤더 4종이 필수입니다. (AGENT_HMAC_ENABLED=false면 생략 가능)",
          properties: {
            "x-key-id": { type: "string", default: "dev-key-id" },
            "x-timestamp": { type: "string", default: "1730000000" },
            "x-nonce": { type: "string", default: "nonce-123" },
            "x-signature": { type: "string", default: "put-hmac-signature-here" }
          }
        },
        body: {
          type: "object",
          required: ["state"],
          examples: [
            {
              model: "google-genai:gemini-2.5-flash-lite",
              state: {
                messages: [{ role: "user", content: "오늘 내 감정 흐름 알려줘" }],
                viewerTimezone: "Asia/Seoul"
              }
            }
          ],
          properties: {
            model: { type: "string", default: "google-genai:gemini-2.5-flash-lite" },
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
          429: {
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
      const parseStartAt = Date.now();
      const parsed = parseIntentRequestBody(request.body);
      const parseMs = Date.now() - parseStartAt;

      if (!parsed.ok) {
        request.log.warn({ parseMs, elapsedMs: Date.now() - startAt, error: parsed.error }, "intent.api.invalid_request");
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
        const serviceLookupStartAt = Date.now();
        const detector = services.getDetector(parsed.data.model);
        const serviceLookupMs = Date.now() - serviceLookupStartAt;
        const detectStartAt = Date.now();
        const result = await detector.detect({
          state: parsed.data.state
        });
        const detectMs = Date.now() - detectStartAt;

        const matchFeatureStartAt = Date.now();
        const matchedFeature = services.registry.getById(result.parsed.featureId);
        const matchFeatureMs = Date.now() - matchFeatureStartAt;
        const elapsedMs = Date.now() - startAt;
        request.log.info(
          {
            model: parsed.data.model,
            featureId: result.parsed.featureId,
            parseMs,
            serviceLookupMs,
            detectMs,
            matchFeatureMs,
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
        const rateLimit = getProviderRateLimit(error);
        if (rateLimit.isRateLimit) {
          return reply
            .status(429)
            .send(
              buildErrorResponse(
                request.id,
                "RATE_LIMITED",
                rateLimit.retryAfterSec
                  ? `provider rate limited, retry after ${rateLimit.retryAfterSec}s`
                  : "provider rate limited"
              )
            );
        }
        request.log.error(
          {
            model: parsed.data.model,
            parseMs,
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
