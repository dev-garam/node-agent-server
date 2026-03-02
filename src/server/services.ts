import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ChatResponder } from "../chat/chatResponder.js";
import { registerDefaultFeatures } from "../features/index.js";
import { IntentDetector } from "../intent/intentDetector.js";
import { type FeatureRegistry, getFeatureRegistry } from "../intent/registry.js";
import { buildHmacVerifier } from "./hmacAuth.js";

export interface ServerServices {
  registry: FeatureRegistry;
  getDetector: (modelName: string) => IntentDetector;
  getResponder: (modelName: string) => ChatResponder;
  requireInternalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
}

export const buildServerServices = (app: FastifyInstance): ServerServices => {
  const registry = getFeatureRegistry();
  registerDefaultFeatures(registry);

  const hmacVerifier = buildHmacVerifier(app.log);
  const detectorCache = new Map<string, IntentDetector>();
  const responderCache = new Map<string, ChatResponder>();

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

  return {
    registry,
    getDetector,
    getResponder,
    requireInternalAuth
  };
};
