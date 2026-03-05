import { buildApp } from "./app.js";
import { loadEnv } from "./loadEnv.js";

loadEnv();

const port = Number(process.env.PORT ?? 8889);
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
  const app = await buildApp();
  await app.listen({ port, host });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
