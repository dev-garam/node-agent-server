import { initChatModel } from "langchain/chat_models/universal";

export interface DetectorModelConfig {
  model: string;
  temperature?: number;
}

export const createChatModel = async (config: DetectorModelConfig) => {
  return initChatModel(config.model, {
    temperature: config.temperature ?? 0
  });
};
