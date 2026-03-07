import type { FastifyRequest } from "fastify";
import { normalizeClientIp } from "../inference/location/locationResolver.js";
import type { ChatState } from "../types/chat.js";

const extractHeaderIp = (request: FastifyRequest): string | undefined => {
  const headerCandidates = [
    request.headers["x-forwarded-for"],
    request.headers["x-real-ip"],
    request.headers["cf-connecting-ip"],
    request.headers["true-client-ip"],
    request.headers["fastly-client-ip"]
  ];

  for (const value of headerCandidates) {
    const candidate = Array.isArray(value) ? value[0] : value;
    const normalized = normalizeClientIp(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
};

export const applyRequestLocationFallback = (request: FastifyRequest, state: ChatState): ChatState => {
  if (state.viewerAddress) {
    return state;
  }

  const headerIp = extractHeaderIp(request);
  if (headerIp) {
    state.viewerAddress = headerIp;
    return state;
  }

  const requestIp = normalizeClientIp(request.ip);
  if (requestIp) {
    state.viewerAddress = requestIp;
  }

  return state;
};

