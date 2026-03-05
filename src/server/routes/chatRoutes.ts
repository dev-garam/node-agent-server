import type { FastifyInstance } from "fastify";
import { buildErrorResponse } from "../errors.js";
import { getProviderRateLimit } from "../providerError.js";
import { parseChatReplyRequestBody } from "../parsers.js";
import type { ServerServices } from "../services.js";

const LOG_PREVIEW_CHARS = 500;
const previewText = (value: string): string => {
  const limit = Number.isFinite(LOG_PREVIEW_CHARS) && LOG_PREVIEW_CHARS > 0 ? Math.floor(LOG_PREVIEW_CHARS) : 400;
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...(truncated ${value.length - limit} chars)`;
};
const isLevelEnabled = (logger: FastifyInstance["log"], level: "debug" | "trace"): boolean => {
  const candidate = logger as unknown as { isLevelEnabled?: (l: string) => boolean };
  if (typeof candidate?.isLevelEnabled === "function") {
    return candidate.isLevelEnabled(level);
  }
  return true;
};

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
          required: ["session", "state"],
          examples: [
            {
              model: "google-genai:gemini-2.5-flash-lite",
              session: {
                id: "chat_session_id",
                userId: "user_123",
                tenantId: "tenant_a",
                serviceId: "saju-service"
              },
              state: {
                messages: [{ role: "user", content: "오늘 운세 알려줘" }],
                viewerTimezone: "Asia/Seoul"
              }
            }
          ],
          properties: {
            model: { type: "string", default: "google-genai:gemini-2.5-flash-lite" },
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
      const parsed = parseChatReplyRequestBody(request.body);
      const parseMs = Date.now() - parseStartAt;
      if (!parsed.ok) {
        request.log.warn({ parseMs, elapsedMs: Date.now() - startAt, error: parsed.error }, "chat.api.invalid_request");
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
      }

      const messages = parsed.data.state.messages;
      const lastMessage = messages[messages.length - 1];
      const logDebug = isLevelEnabled(request.log, "debug");
      request.log.debug(
        {
          model: parsed.data.model,
          messageCount: messages.length,
          lastRole: lastMessage?.role,
          ...(logDebug && lastMessage ? { lastMessagePreview: previewText(lastMessage.content) } : {})
        },
        "chat.api.request"
      );

      try {
        const serviceLookupStartAt = Date.now();
        const responder = services.getResponder(parsed.data.model);
        const serviceLookupMs = Date.now() - serviceLookupStartAt;
        const respondStartAt = Date.now();
        const response = await responder.respond({
          state: parsed.data.state
        });
        const respondMs = Date.now() - respondStartAt;
        request.log.info(
          {
            model: parsed.data.model,
            parseMs,
            serviceLookupMs,
            respondMs,
            elapsedMs: Date.now() - startAt
          },
          "chat.api.response"
        );
        return response;
      } catch (error) {
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
        request.log.error({ model: parsed.data.model, parseMs, elapsedMs: Date.now() - startAt, error }, "chat.reply.error");
        return reply
          .status(500)
          .send(buildErrorResponse(request.id, "AGENT_UNAVAILABLE", "agent dependency is unavailable"));
      }
    }
  );

  app.post(
    "/api/v1/chat/reply-with-intent/stream",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Chat"],
        summary: "최종 답변 + 인텐트 병렬 처리 (SSE 스트림)",
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
          required: ["session", "state"],
          examples: [
            {
              model: "google-genai:gemini-2.5-flash-lite",
              session: {
                id: "chat_session_id",
                userId: "user_123",
                tenantId: "tenant_a",
                serviceId: "saju-service"
              },
              state: {
                messages: [{ role: "user", content: "오늘 운세 알려줘" }],
                viewerTimezone: "Asia/Seoul"
              }
            }
          ],
          properties: {
            model: { type: "string", default: "google-genai:gemini-2.5-flash-lite" },
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
        }
      }
    },
    async (request, reply) => {
      const startAt = Date.now();
      const parsed = parseChatReplyRequestBody(request.body);
      if (!parsed.ok) {
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
      }

      const responder = services.getResponder(parsed.data.model);
      const detector = services.getDetector(parsed.data.model);

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });

      const writeEvent = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const detectStartedAt = Date.now();
      const detectPromise = detector
        .detect({
          state: parsed.data.state
        })
        .then((detectResult) => {
          const matchedFeature = services.registry.getById(detectResult.parsed.featureId);
          return {
            elapsedMs: Date.now() - detectStartedAt,
            payload: {
              parsed: detectResult.parsed,
              rawResponse: detectResult.rawResponse,
              matchedFeature: matchedFeature
                ? {
                    id: matchedFeature.id,
                    title: matchedFeature.title
                  }
                : null
            }
          };
        });

      try {
        writeEvent("message.start", {
          requestId: request.id,
          model: parsed.data.model
        });

        let fullText = "";
        const streamStartedAt = Date.now();
        const stream = responder.streamRespond({
          state: parsed.data.state
        });
        let finalResponse: { answer: string; modelName?: string; finishReason?: string; usage?: unknown } | null = null;
        while (true) {
          const next = await stream.next();
          if (next.done) {
            finalResponse = next.value;
            break;
          }
          fullText += next.value.text;
          writeEvent("message.delta", { text: next.value.text });
        }

        writeEvent("message.end", {
          answer: finalResponse?.answer ?? fullText,
          modelName: finalResponse?.modelName ?? parsed.data.model,
          finishReason: finalResponse?.finishReason
        });

        try {
          const detect = await detectPromise;
          writeEvent("intent.result", {
            elapsedMs: detect.elapsedMs,
            ...detect.payload
          });
        } catch (intentError) {
          writeEvent("intent.error", { message: "intent detection failed" });
          request.log.warn({ model: parsed.data.model, intentError }, "chat.api.stream.intent_failed");
        }

        writeEvent("done", {
          elapsedMs: Date.now() - startAt,
          streamMs: Date.now() - streamStartedAt
        });
      } catch (error) {
        const rateLimit = getProviderRateLimit(error);
        if (rateLimit.isRateLimit) {
          writeEvent("error", {
            code: "RATE_LIMITED",
            message: rateLimit.retryAfterSec
              ? `provider rate limited, retry after ${rateLimit.retryAfterSec}s`
              : "provider rate limited",
            retryAfterSec: rateLimit.retryAfterSec
          });
          return reply.raw.end();
        }
        writeEvent("error", { message: "stream processing failed" });
        request.log.error({ model: parsed.data.model, error }, "chat.api.stream.error");
      } finally {
        reply.raw.end();
      }

      return reply;
    }
  );

  app.post(
    "/api/v1/chat/reply-with-intent",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Chat"],
        summary: "최종 답변 우선 반환 + 인텐트 병렬 처리",
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
          required: ["session", "state"],
          examples: [
            {
              model: "google-genai:gemini-2.5-flash-lite",
              session: {
                id: "chat_session_id",
                userId: "user_123",
                tenantId: "tenant_a",
                serviceId: "saju-service"
              },
              state: {
                messages: [{ role: "user", content: "오늘 운세 알려줘" }],
                viewerTimezone: "Asia/Seoul"
              }
            }
          ],
          properties: {
            model: { type: "string", default: "google-genai:gemini-2.5-flash-lite" },
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
              },
              intent: {
                anyOf: [
                  {
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
                  { type: "null" }
                ]
              },
              intentStatus: {
                type: "string",
                enum: ["ok", "failed", "pending"]
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
      const parsed = parseChatReplyRequestBody(request.body);
      const parseMs = Date.now() - parseStartAt;
      if (!parsed.ok) {
        request.log.warn(
          { parseMs, elapsedMs: Date.now() - startAt, error: parsed.error },
          "chat.api.with_intent.invalid_request"
        );
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
      }

      const messages = parsed.data.state.messages;
      const lastMessage = messages[messages.length - 1];
      const logDebug = isLevelEnabled(request.log, "debug");
      request.log.debug(
        {
          model: parsed.data.model,
          messageCount: messages.length,
          lastRole: lastMessage?.role,
          ...(logDebug && lastMessage ? { lastMessagePreview: previewText(lastMessage.content) } : {})
        },
        "chat.api.with_intent.request"
      );

      try {
        const serviceLookupStartAt = Date.now();
        const responder = services.getResponder(parsed.data.model);
        const detector = services.getDetector(parsed.data.model);
        const serviceLookupMs = Date.now() - serviceLookupStartAt;

        const parallelStartAt = Date.now();
        let respondDoneAt = 0;
        let detectDoneAt = 0;
        let detectSettled = false;
        let detectStatus: "ok" | "failed" | "pending" = "pending";
        let detectReady = false;
        let detectResultPayload: {
          parsed: unknown;
          rawResponse: string;
          matchedFeature: { id: string; title: string } | null;
        } | null = null;
        let detectError: unknown = null;

        const respondPromise = responder
          .respond({
            state: parsed.data.state
          })
          .then((value) => {
            respondDoneAt = Date.now();
            return value;
          });

        const detectPromise = detector
          .detect({
            state: parsed.data.state
          })
          .then((value) => {
            detectDoneAt = Date.now();
            const matchedFeature = services.registry.getById(value.parsed.featureId);
            detectResultPayload = {
              parsed: value.parsed,
              rawResponse: value.rawResponse,
              matchedFeature: matchedFeature
                ? {
                    id: matchedFeature.id,
                    title: matchedFeature.title
                  }
                : null
            };
            detectStatus = "ok";
            detectReady = true;
          })
          .catch((error) => {
            detectDoneAt = Date.now();
            detectStatus = "failed";
            detectError = error;
            detectReady = true;
          })
          .finally(() => {
            detectSettled = true;
          });

        const response = await respondPromise;
        const respondMs = (respondDoneAt || Date.now()) - parallelStartAt;

        const detectMs = detectSettled ? (detectDoneAt || Date.now()) - parallelStartAt : Date.now() - parallelStartAt;
        const intent = detectSettled && detectReady && detectResultPayload ? detectResultPayload : null;

        const waitForIntentAfterRespondMs =
          detectDoneAt > 0 && respondDoneAt > 0 && detectDoneAt > respondDoneAt ? detectDoneAt - respondDoneAt : 0;
        const criticalPathMs = Math.max(respondMs, detectMs);
        const elapsedMs = Date.now() - startAt;

        request.log.info(
          {
            model: parsed.data.model,
            parseMs,
            serviceLookupMs,
            respondMs,
            detectMs,
            detectStatus,
            intentIncluded: Boolean(intent),
            waitForIntentAfterRespondMs,
            criticalPathMs,
            elapsedMs
          },
          "chat.api.with_intent.response"
        );

        request.log.debug(
          {
            model: parsed.data.model,
            timeline: {
              startAtMs: startAt,
              parseDoneOffsetMs: parseMs,
              serviceLookupDoneOffsetMs: parseMs + serviceLookupMs,
              respondDoneOffsetMs: respondDoneAt ? respondDoneAt - startAt : undefined,
              detectDoneOffsetMs: detectDoneAt ? detectDoneAt - startAt : undefined,
              elapsedMs
            }
          },
          "chat.api.with_intent.timeline"
        );

        void detectPromise.then(() => {
          const asyncDetectMs = (detectDoneAt || Date.now()) - parallelStartAt;
          if (detectStatus === "failed") {
            request.log.warn(
              {
                model: parsed.data.model,
                detectMs: asyncDetectMs,
                intentError: detectError
              },
              "chat.api.with_intent.intent_async_failed"
            );
            return;
          }
          request.log.debug(
            {
              model: parsed.data.model,
              detectMs: asyncDetectMs
            },
            "chat.api.with_intent.intent_async_done"
          );
        });

        return {
          ...response,
          intent,
          intentStatus: detectStatus
        };
      } catch (error) {
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
          { model: parsed.data.model, parseMs, elapsedMs: Date.now() - startAt, error },
          "chat.api.with_intent.error"
        );
        return reply
          .status(500)
          .send(buildErrorResponse(request.id, "AGENT_UNAVAILABLE", "agent dependency is unavailable"));
      }
    }
  );
};
