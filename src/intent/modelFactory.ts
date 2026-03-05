import { initChatModel } from "langchain/chat_models/universal";

export interface DetectorModelConfig {
  model: string;
  temperature?: number;
}

export interface ResolvedModelConfig {
  model: string;
  modelProvider?: string;
  apiKey?: string;
}

const modelCache = new Map<string, Promise<unknown>>();

export const resolveModelConfig = (model: string): ResolvedModelConfig => {
  if (model.startsWith("google:")) {
    const actualModel = model.slice("google:".length);
    return {
      model: actualModel,
      modelProvider: "google-genai",
      apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY
    };
  }

  if (model.startsWith("google-genai:")) {
    const actualModel = model.slice("google-genai:".length);
    return {
      model: actualModel,
      modelProvider: "google-genai",
      apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY
    };
  }

  if (model.startsWith("gemini")) {
    return {
      model,
      modelProvider: "google-genai",
      apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY
    };
  }

  return { model };
};

export const createChatModel = async (config: DetectorModelConfig) => {
  const temperature = config.temperature ?? 0;
  const resolved = resolveModelConfig(config.model);
  const cacheKey = `${resolved.model}::${resolved.modelProvider ?? ""}::${temperature}`;
  let cached = modelCache.get(cacheKey);
  if (!cached) {
    cached = initChatModel(resolved.model, {
      temperature,
      maxRetries: 0,
      ...(resolved.modelProvider ? { modelProvider: resolved.modelProvider } : {}),
      ...(resolved.apiKey ? { apiKey: resolved.apiKey } : {})
    });
    modelCache.set(cacheKey, cached);
  }
  return cached;
};
