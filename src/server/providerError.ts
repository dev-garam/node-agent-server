const parseRetryDelaySec = (value: unknown): number | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/i);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return Math.ceil(parsed);
};

const findRetryAfterSec = (error: unknown): number | undefined => {
  const candidate = error as {
    errorDetails?: Array<{ "@type"?: string; retryDelay?: string }>;
    message?: string;
    cause?: unknown;
  };

  const fromDetails = candidate.errorDetails
    ?.find((item) => item?.["@type"]?.includes("RetryInfo"))
    ?.retryDelay;
  const parsedFromDetails = parseRetryDelaySec(fromDetails);
  if (parsedFromDetails !== undefined) {
    return parsedFromDetails;
  }

  if (typeof candidate.message === "string") {
    const match = candidate.message.match(/retry in\s+([0-9.]+)s/i);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.ceil(parsed);
      }
    }
  }

  if (candidate.cause) {
    return findRetryAfterSec(candidate.cause);
  }
  return undefined;
};

const findStatus = (error: unknown): number | undefined => {
  const candidate = error as { status?: number; cause?: unknown };
  if (typeof candidate.status === "number") {
    return candidate.status;
  }
  if (candidate.cause) {
    return findStatus(candidate.cause);
  }
  return undefined;
};

export const getProviderRateLimit = (error: unknown): { isRateLimit: boolean; retryAfterSec?: number } => {
  const status = findStatus(error);
  if (status !== 429) {
    return { isRateLimit: false };
  }
  return {
    isRateLimit: true,
    retryAfterSec: findRetryAfterSec(error)
  };
};
