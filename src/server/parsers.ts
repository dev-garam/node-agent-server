import type { ChatState, InStateChatMessage, UserMemory } from "../types/chat.js";

const DEFAULT_MODEL =
  process.env.DEFAULT_MODEL ??
  process.env.INTENT_DETECT_DEFAULT_MODEL ??
  "google-genai:gemini-2.5-flash-lite";

interface ParsedSession {
  id: string;
  userId: string;
  tenantId: string;
  serviceId: string;
}

export interface ParsedIntentRequest {
  model: string;
  state: ChatState;
}

export interface ParsedChatReplyRequest {
  model: string;
  session: ParsedSession;
  state: ChatState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseMessage = (value: unknown): InStateChatMessage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const role = value.role;
  const content = value.content;
  if ((role !== "user" && role !== "assistant") || typeof content !== "string" || content.length === 0) {
    return undefined;
  }

  return {
    role,
    content,
    imageDescription: typeof value.imageDescription === "string" ? value.imageDescription : undefined
  };
};

const parseUserMemory = (value: unknown): UserMemory[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed: UserMemory[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== "string" || typeof item.content !== "string") {
      continue;
    }

    parsed.push({
      key: item.key,
      content: item.content,
      targetDate: typeof item.targetDate === "string" || item.targetDate === null ? item.targetDate : undefined
    });
  }

  return parsed;
};

const parseStateFromBody = (body: unknown): { ok: true; state: ChatState } | { ok: false; error: string } => {
  if (!isRecord(body) || !isRecord(body.state)) {
    return { ok: false, error: "invalid_state" };
  }

  const messagesRaw = body.state.messages;
  if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
    return { ok: false, error: "invalid_messages" };
  }

  const messages: InStateChatMessage[] = [];
  for (const raw of messagesRaw) {
    const parsedMessage = parseMessage(raw);
    if (!parsedMessage) {
      return { ok: false, error: "invalid_message_item" };
    }
    messages.push(parsedMessage);
  }

  const state: ChatState = { messages };

  if (typeof body.state.viewerTimezone === "string") {
    state.viewerTimezone = body.state.viewerTimezone;
  }
  if (typeof body.state.viewerAddress === "string") {
    state.viewerAddress = body.state.viewerAddress;
  }
  if (typeof body.state.viewerCountry === "string") {
    state.viewerCountry = body.state.viewerCountry;
  }
  if (typeof body.state.viewerCity === "string") {
    state.viewerCity = body.state.viewerCity;
  }
  if (typeof body.state.viewerLat === "number" && Number.isFinite(body.state.viewerLat)) {
    state.viewerLat = body.state.viewerLat;
  }
  if (typeof body.state.viewerLon === "number" && Number.isFinite(body.state.viewerLon)) {
    state.viewerLon = body.state.viewerLon;
  }
  if (typeof body.state.imageDescription === "string") {
    state.imageDescription = body.state.imageDescription;
  }
  if (isRecord(body.state.currentFeature) && typeof body.state.currentFeature.id === "string") {
    state.currentFeature = { id: body.state.currentFeature.id };
  }

  const userMemory = parseUserMemory(body.state.userMemory);
  if (userMemory && userMemory.length > 0) {
    state.userMemory = userMemory;
  }

  return { ok: true, state };
};

const parseSession = (value: unknown): ParsedSession | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.tenantId !== "string" ||
    typeof value.serviceId !== "string"
  ) {
    return undefined;
  }

  return {
    id: value.id,
    userId: value.userId,
    tenantId: value.tenantId,
    serviceId: value.serviceId
  };
};

export const parseIntentRequestBody = (
  body: unknown
): { ok: true; data: ParsedIntentRequest } | { ok: false; error: string } => {
  const parsedState = parseStateFromBody(body);
  if (!parsedState.ok) {
    return parsedState;
  }

  if (!isRecord(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const model = typeof body.model === "string" && body.model.length > 0 ? body.model : DEFAULT_MODEL;
  return {
    ok: true,
    data: {
      model,
      state: parsedState.state
    }
  };
};

export const parseChatReplyRequestBody = (
  body: unknown
): { ok: true; data: ParsedChatReplyRequest } | { ok: false; error: string } => {
  const parsedState = parseStateFromBody(body);
  if (!parsedState.ok) {
    return parsedState;
  }

  if (!isRecord(body)) {
    return { ok: false, error: "invalid_body" };
  }

  const session = parseSession(body.session);
  if (!session) {
    return { ok: false, error: "invalid_session" };
  }

  const model = typeof body.model === "string" && body.model.length > 0 ? body.model : DEFAULT_MODEL;
  return {
    ok: true,
    data: {
      model,
      session,
      state: parsedState.state
    }
  };
};
