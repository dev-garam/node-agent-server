import { initChatModel } from "langchain/chat_models/universal";

export interface DetectorModelConfig {
  model: string;
  temperature?: number;
}

const modelCache = new Map<string, Promise<unknown>>();

export const createChatModel = async (config: DetectorModelConfig) => {
  const temperature = config.temperature ?? 0;
  const cacheKey = `${config.model}::${temperature}`;
  let cached = modelCache.get(cacheKey);
  if (!cached) {
    cached = initChatModel(config.model, {
      temperature
    });
    modelCache.set(cacheKey, cached);
  }
  return cached;
};
