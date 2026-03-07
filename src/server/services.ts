import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ChatResponder } from "../chat/chatResponder.js";
import { registerDefaultFeatures } from "../features/index.js";
import { defaultExecutors } from "../inference/features/executors/core.js";
import { FeatureExecutorRegistry } from "../inference/features/registry.js";
import { NoopHistoryProvider } from "../inference/history/historyProvider.js";
import { NoopMemoryProvider } from "../inference/memory/memoryProvider.js";
import { InferencePipeline } from "../inference/pipeline/inferencePipeline.js";
import { NoopConversationStore } from "../inference/store/conversationStore.js";
import { IntentDetector } from "../intent/intentDetector.js";
import { type FeatureRegistry, getFeatureRegistry } from "../intent/registry.js";
import { buildHmacVerifier } from "./hmacAuth.js";

export interface ServerServices {
  registry: FeatureRegistry;
  getDetector: (modelName: string) => IntentDetector;
  getResponder: (modelName: string) => ChatResponder;
  getPipeline: (modelName: string) => InferencePipeline;
  requireInternalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
}

export const buildServerServices = (app: FastifyInstance): ServerServices => {
  const registry = getFeatureRegistry();
  registerDefaultFeatures(registry);

  const hmacVerifier = buildHmacVerifier(app.log);
  const detectorCache = new Map<string, IntentDetector>();
  const responderCache = new Map<string, ChatResponder>();
  const pipelineCache = new Map<string, InferencePipeline>();
  const executorRegistry = new FeatureExecutorRegistry();
  const historyProvider = new NoopHistoryProvider();
  const memoryProvider = new NoopMemoryProvider();
  const conversationStore = new NoopConversationStore();
  for (const executor of defaultExecutors) {
    executorRegistry.register(executor);
  }

  const getDetector = (modelName: string): IntentDetector => {
    let detector = detectorCache.get(modelName);
    if (!detector) {
      detector = new IntentDetector(registry, modelName, app.log);
      detectorCache.set(modelName, detector);
    }
    return detector;
  };

  const getResponder = (modelName: string): ChatResponder => {
    let responder = responderCache.get(modelName);
    if (!responder) {
      responder = new ChatResponder(modelName, app.log);
      responderCache.set(modelName, responder);
    }
    return responder;
  };

  const requireInternalAuth = (request: FastifyRequest, reply: FastifyReply) => {
    return hmacVerifier.verify(request, reply);
  };

  const getPipeline = (modelName: string): InferencePipeline => {
    let pipeline = pipelineCache.get(modelName);
    if (!pipeline) {
      pipeline = new InferencePipeline(
        getDetector(modelName),
        getResponder(modelName),
        registry,
        executorRegistry,
        historyProvider,
        memoryProvider,
        conversationStore,
        app.log
      );
      pipelineCache.set(modelName, pipeline);
    }
    return pipeline;
  };

  return {
    registry,
    getDetector,
    getResponder,
    getPipeline,
    requireInternalAuth
  };
};
