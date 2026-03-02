import type { FastifyInstance } from "fastify";
import type { ServerServices } from "../services.js";

export const registerHealthRoutes = (app: FastifyInstance, services: ServerServices): void => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "헬스 체크",
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

  app.get(
    "/api/v1/ping",
    {
      preHandler: services.requireInternalAuth,
      schema: {
        tags: ["Health"],
        summary: "핑 체크",
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
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" }
            }
          },
          401: {
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
    async () => ({ status: "ok" })
  );
};
