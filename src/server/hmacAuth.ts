import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";

export interface HmacErrorBody {
  code: string;
  message: string;
  requestId: string;
}

interface HmacConfig {
  enabled: boolean;
  keyId: string;
  secret: string;
  timestampSkewSec: number;
  nonceTtlSec: number;
}

const getHeaderString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const buildBodyString = (request: FastifyRequest): string => {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return "";
  }

  const body = request.body;
  if (body == null) {
    return "";
  }

  if (typeof body === "string") {
    return body;
  }

  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }

  return JSON.stringify(body);
};

const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");

const safeCompareHex = (a: string, b: string): boolean => {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

const errorBody = (request: FastifyRequest, code: string, message: string): HmacErrorBody => ({
  code,
  message,
  requestId: request.id
});

export const buildHmacVerifier = (logger: FastifyBaseLogger) => {
  const config: HmacConfig = {
    enabled: process.env.AGENT_HMAC_ENABLED !== "false",
    keyId: process.env.AGENT_HMAC_KEY_ID ?? "",
    secret: process.env.AGENT_HMAC_SECRET ?? "",
    timestampSkewSec: Number(process.env.AGENT_HMAC_TTL_SEC ?? 60),
    nonceTtlSec: Number(process.env.AGENT_HMAC_NONCE_TTL_SEC ?? 90)
  };

  const nonceCache = new Map<string, number>();

  if (config.enabled && (!config.keyId || !config.secret)) {
    throw new Error("HMAC is enabled but AGENT_HMAC_KEY_ID or AGENT_HMAC_SECRET is missing");
  }

  const cleanupExpiredNonce = (nowMs: number) => {
    for (const [nonce, expiresAt] of nonceCache.entries()) {
      if (expiresAt <= nowMs) {
        nonceCache.delete(nonce);
      }
    }
  };

  const verify = async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    if (!config.enabled) {
      return true;
    }

    const keyId = getHeaderString(request.headers["x-key-id"] as string | string[] | undefined);
    const timestamp = getHeaderString(request.headers["x-timestamp"] as string | string[] | undefined);
    const nonce = getHeaderString(request.headers["x-nonce"] as string | string[] | undefined);
    const signature = getHeaderString(request.headers["x-signature"] as string | string[] | undefined);

    if (!keyId || !timestamp || !nonce || !signature) {
      await reply.status(401).send(errorBody(request, "UNAUTHORIZED_SIGNATURE", "missing hmac headers"));
      return false;
    }

    if (keyId !== config.keyId) {
      await reply.status(401).send(errorBody(request, "UNAUTHORIZED_SIGNATURE", "invalid key id"));
      return false;
    }

    const timestampSec = Number(timestamp);
    if (!Number.isFinite(timestampSec)) {
      await reply.status(401).send(errorBody(request, "UNAUTHORIZED_SIGNATURE", "invalid timestamp"));
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestampSec) > config.timestampSkewSec) {
      await reply.status(401).send(errorBody(request, "UNAUTHORIZED_SIGNATURE", "timestamp out of range"));
      return false;
    }

    const nowMs = Date.now();
    cleanupExpiredNonce(nowMs);
    if (nonceCache.has(nonce)) {
      await reply.status(401).send(errorBody(request, "UNAUTHORIZED_SIGNATURE", "nonce replay detected"));
      return false;
    }

    const bodyString = buildBodyString(request);
    const bodyHash = sha256Hex(bodyString);
    const path = request.url.split("?")[0];
    const stringToSign = `${request.method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const expected = createHmac("sha256", config.secret).update(stringToSign).digest("hex");

    if (!safeCompareHex(signature, expected)) {
      await reply.status(401).send(errorBody(request, "UNAUTHORIZED_SIGNATURE", "invalid signature"));
      return false;
    }

    nonceCache.set(nonce, nowMs + config.nonceTtlSec * 1000);
    return true;
  };

  logger.info(
    {
      hmacEnabled: config.enabled,
      timestampSkewSec: config.timestampSkewSec,
      nonceTtlSec: config.nonceTtlSec
    },
    "hmac.config"
  );

  return { verify, enabled: config.enabled };
};
