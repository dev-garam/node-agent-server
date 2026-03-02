import type { FastifyServerOptions } from "fastify";

const isProduction = process.env.NODE_ENV === "production";

export const buildLoggerOptions = (): FastifyServerOptions["logger"] => {
  const level = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");

  if (isProduction) {
    return {
      level
    };
  }

  return {
    level,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
        ignore: "pid,hostname",
        singleLine: true
      }
    }
  };
};
