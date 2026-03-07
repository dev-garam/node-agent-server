import type { FastifyInstance } from "fastify";
import { buildErrorResponse } from "../errors.js";
import { parseIntentRequestBody } from "../parsers.js";
import { applyRequestLocationFallback } from "../requestLocation.js";
import type { ServerServices } from "../services.js";
import { buildMockIntent, resolveMockScenario } from "../../testing/mockAgentResponses.js";

const DEFAULT_MODEL = "google-genai:gemini-2.5-flash-lite";

export const registerIntentRoutes = (app: FastifyInstance, services: ServerServices): void => {
  app.post(
    "/api/v1/intent/detect",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Intent"],
        summary: "인텐트 감지",
        body: {
          type: "object",
          required: ["state"],
          examples: [
            {
              model: DEFAULT_MODEL,
              state: {
                messages: [{ role: "user", content: "오늘 날씨 알려줘" }],
                viewerTimezone: "Asia/Seoul"
              }
            }
          ],
          properties: {
            model: { type: "string", default: DEFAULT_MODEL },
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
        }
      }
    },
    async (request, reply) => {
      const parsed = parseIntentRequestBody(request.body);
      if (!parsed.ok) {
        return reply.status(400).send(buildErrorResponse(request.id, "INVALID_REQUEST", "invalid request body"));
      }
      applyRequestLocationFallback(request, parsed.data.state);
      const mockScenario = resolveMockScenario(request);

      if (mockScenario) {
        return buildMockIntent(parsed.data.model, mockScenario);
      }

      try {
        const intent = await services.getPipeline(parsed.data.model).detectIntent({
          model: parsed.data.model,
          state: parsed.data.state
        });
        return intent;
      } catch (error) {
        request.log.error({ error }, "intent.detect.failed");
        return reply.status(500).send(buildErrorResponse(request.id, "AGENT_UNAVAILABLE", "agent dependency is unavailable"));
      }
    }
  );
};
