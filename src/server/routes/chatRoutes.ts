import type { FastifyInstance, FastifyReply } from "fastify";
import { buildErrorResponse } from "../errors.js";
import { parseChatReplyRequestBody } from "../parsers.js";
import { applyRequestLocationFallback } from "../requestLocation.js";
import type { ServerServices } from "../services.js";

const DEFAULT_MODEL = "google-genai:gemini-2.5-flash-lite";

const sendSseEvent = (reply: FastifyReply, event: string, data: unknown): void => {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
};

const chatRequestSchema = {
  type: "object",
  required: ["session", "state"],
  examples: [
    {
      model: DEFAULT_MODEL,
      session: {
        id: "chat_session_id",
        userId: "user_123",
        tenantId: "tenant_a",
        serviceId: "saju-service"
      },
      state: {
        messages: [{ role: "user", content: "오늘 날씨 알려줘" }],
        viewerTimezone: "Asia/Seoul"
      }
    }
  ],
  properties: {
    model: { type: "string", default: DEFAULT_MODEL },
    session: {
      type: "object",
      required: ["id", "userId", "tenantId", "serviceId"],
      properties: {
        id: { type: "string", default: "chat_session_id" },
        userId: { type: "string", default: "user_123" },
        tenantId: { type: "string", default: "tenant_a" },
        serviceId: { type: "string", default: "saju-service" }
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
              role: { type: "string", enum: ["user", "assistant"], default: "user" },
              content: { type: "string", default: "오늘 날씨 알려줘" },
              imageDescription: { type: "string" }
            }
          }
        },
        viewerTimezone: { type: "string", default: "Asia/Seoul" },
        viewerAddress: { type: "string" },
        viewerCountry: { type: "string" },
        viewerCity: { type: "string" },
        viewerLat: { type: "number", default: 37.5665 },
        viewerLon: { type: "number", default: 126.9780 },
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
} as const;

export const registerChatRoutes = (app: FastifyInstance, services: ServerServices): void => {
  app.post(
    "/api/v1/chat/reply",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Chat"],
        summary: "최종 답변 생성",
        body: chatRequestSchema
      }
    },
    async (request, reply) => {
      const parsed = parseChatReplyRequestBody(request.body);
      if (!parsed.ok) {
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
      }
      applyRequestLocationFallback(request, parsed.data.state);

      try {
        const output = await services.getPipeline(parsed.data.model).run({
          model: parsed.data.model,
          state: parsed.data.state
        });
        return {
          answer: output.answer,
          modelName: output.modelName,
          finishReason: output.finishReason,
          usage: output.usage
        };
      } catch (error) {
        request.log.error({ error }, "chat.reply.failed");
        return reply.status(500).send(buildErrorResponse(request.id, "AGENT_UNAVAILABLE", "agent dependency is unavailable"));
      }
    }
  );

  app.post(
    "/api/v1/chat/reply-with-intent",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Chat"],
        summary: "최종 답변 + 인텐트 결과 반환",
        body: chatRequestSchema
      }
    },
    async (request, reply) => {
      const parsed = parseChatReplyRequestBody(request.body);
      if (!parsed.ok) {
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
      }
      applyRequestLocationFallback(request, parsed.data.state);

      try {
        const output = await services.getPipeline(parsed.data.model).run({
          model: parsed.data.model,
          state: parsed.data.state
        });
        return output;
      } catch (error) {
        request.log.error({ error }, "chat.reply_with_intent.failed");
        return reply.status(500).send(buildErrorResponse(request.id, "AGENT_UNAVAILABLE", "agent dependency is unavailable"));
      }
    }
  );

  app.post(
    "/api/v1/chat/reply-with-intent/stream",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Chat"],
        summary: "최종 답변 + 인텐트 결과 SSE",
        body: chatRequestSchema
      }
    },
    async (request, reply) => {
      const parsed = parseChatReplyRequestBody(request.body);
      if (!parsed.ok) {
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
      }
      applyRequestLocationFallback(request, parsed.data.state);

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });

      try {
        const stream = services.getPipeline(parsed.data.model).stream({
          model: parsed.data.model,
          state: parsed.data.state
        });
        for await (const event of stream) {
          if (event.type === "message.start") {
            sendSseEvent(reply, event.type, {
              requestId: request.id,
              ...event.data
            });
            continue;
          }
          sendSseEvent(reply, event.type, event.data);
        }
      } catch (error) {
        request.log.error({ error }, "chat.reply_with_intent.stream.failed");
        sendSseEvent(reply, "error", { message: "stream processing failed" });
      } finally {
        reply.raw.end();
      }

      return reply;
    }
  );
};
