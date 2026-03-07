import type { ChatState } from "../../types/chat.js";

export type LocationQuerySource = "city" | "coordinates" | "client_ip" | "server_ip" | "default";

export interface ResolvedLocationQuery {
  query: string;
  source: LocationQuerySource;
  clientIp?: string;
}

const SERVER_IP_LOOKUP_URL = "https://api.ipify.org?format=json";

const firstIp = (value: string): string => value.split(",")[0]?.trim() ?? value.trim();

export const normalizeClientIp = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = firstIp(value);
  if (normalized.length === 0 || normalized === "::1" || normalized === "127.0.0.1") {
    return undefined;
  }
  return normalized;
};

export const resolveServerPublicIp = async (): Promise<string | undefined> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(SERVER_IP_LOOKUP_URL, { signal: controller.signal });
      if (!response.ok) {
        return undefined;
      }
      const data = (await response.json()) as { ip?: string };
      return normalizeClientIp(data.ip);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return undefined;
  }
};

export const resolveLocationQuery = async (state: ChatState): Promise<ResolvedLocationQuery> => {
  if (state.viewerCity && state.viewerCity.length > 0) {
    return {
      query: state.viewerCity,
      source: "city"
    };
  }

  if (typeof state.viewerLat === "number" && typeof state.viewerLon === "number") {
    return {
      query: `${state.viewerLat},${state.viewerLon}`,
      source: "coordinates"
    };
  }

  const clientIp = normalizeClientIp(state.viewerAddress);
  if (clientIp) {
    return {
      query: clientIp,
      source: "client_ip",
      clientIp
    };
  }

  const serverIp = await resolveServerPublicIp();
  if (serverIp) {
    return {
      query: serverIp,
      source: "server_ip",
      clientIp: serverIp
    };
  }

  return {
    query: "Seoul",
    source: "default"
  };
};

