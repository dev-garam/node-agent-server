import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export const registerCorePlugins = async (app: FastifyInstance): Promise<void> => {
  const corsEnabled = process.env.CORS_ENABLED === "true";
  if (corsEnabled) {
    const corsOrigin = process.env.CORS_ORIGIN?.trim();
    const origin =
      corsOrigin && corsOrigin.length > 0
        ? corsOrigin.split(",").map((item) => item.trim()).filter((item) => item.length > 0)
        : true;
    await app.register(cors, { origin });
  }

  await app.register(swagger, {
    openapi: {
      info: {
        title: "노드 에이전트 서버 API",
        description: "에이전트 서버 내부 연동 API 문서",
        version: "0.1.0"
      }
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });
};
