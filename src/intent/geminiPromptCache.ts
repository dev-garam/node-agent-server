import { createHash } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";

interface CacheEntry {
  name: string;
  expiresAtMs: number;
}

const DEFAULT_CACHE_TTL_SEC = Number(process.env.INTENT_PROMPT_CACHE_TTL_SEC ?? 3600);
const REFRESH_MARGIN_MS = 30 * 1000;
const cacheByKey = new Map<string, CacheEntry>();
const inflightByKey = new Map<string, Promise<string | null>>();

const toModelPath = (model: string): string => (model.startsWith("models/") ? model : `models/${model}`);

const makeCacheKey = (model: string, prompt: string): string =>
  `${model}:${createHash("sha256").update(prompt).digest("hex")}`;

const parseExpireTime = (expireTime?: string): number => {
  if (!expireTime) {
    return Date.now() + DEFAULT_CACHE_TTL_SEC * 1000;
  }
  const parsed = Date.parse(expireTime);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return Date.now() + DEFAULT_CACHE_TTL_SEC * 1000;
};

const createCachedContent = async (params: {
  apiKey: string;
  model: string;
  prompt: string;
  logger?: FastifyBaseLogger;
}): Promise<CacheEntry | null> => {
  const body = {
    model: toModelPath(params.model),
    displayName: "intent-prompt-cache",
    systemInstruction: {
      parts: [{ text: params.prompt }]
    },
    ttl: `${DEFAULT_CACHE_TTL_SEC}s`
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(params.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    params.logger?.warn(
      { status: response.status, statusText: response.statusText, detail },
      "intent.cache.create.failed"
    );
    return null;
  }

  const data = (await response.json()) as { name?: string; expireTime?: string };
  if (!data.name) {
    params.logger?.warn({ data }, "intent.cache.create.invalid_response");
    return null;
  }

  return {
    name: data.name,
    expiresAtMs: parseExpireTime(data.expireTime)
  };
};

export const getOrCreateGeminiPromptCache = async (params: {
  apiKey: string;
  model: string;
  prompt: string;
  logger?: FastifyBaseLogger;
}): Promise<string | null> => {
  if (!params.apiKey || params.apiKey.length === 0) {
    return null;
  }

  const key = makeCacheKey(params.model, params.prompt);
  const current = cacheByKey.get(key);
  if (current && current.expiresAtMs - REFRESH_MARGIN_MS > Date.now()) {
    return current.name;
  }

  const inflight = inflightByKey.get(key);
  if (inflight) {
    return inflight;
  }

  const request = createCachedContent(params)
    .then((created) => {
      if (!created) {
        return null;
      }
      cacheByKey.set(key, created);
      params.logger?.debug(
        {
          model: params.model,
          cacheName: created.name,
          expiresInSec: Math.max(0, Math.floor((created.expiresAtMs - Date.now()) / 1000))
        },
        "intent.cache.ready"
      );
      return created.name;
    })
    .finally(() => {
      inflightByKey.delete(key);
    });

  inflightByKey.set(key, request);
  return request;
};
