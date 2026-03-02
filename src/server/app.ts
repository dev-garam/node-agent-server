import Fastify from "fastify";
import { buildLoggerOptions } from "./logger.js";
import { registerCorePlugins } from "./plugins/corePlugins.js";
import { registerChatRoutes } from "./routes/chatRoutes.js";
import { registerHealthRoutes } from "./routes/healthRoutes.js";
import { registerIntentRoutes } from "./routes/intentRoutes.js";
import { buildServerServices } from "./services.js";

export const buildApp = async () => {
  const app = Fastify({
    logger: buildLoggerOptions(),
    disableRequestLogging: true
  });

  await registerCorePlugins(app);

  const services = buildServerServices(app);
  registerHealthRoutes(app, services);
  registerChatRoutes(app, services);
  registerIntentRoutes(app, services);

  return app;
};
