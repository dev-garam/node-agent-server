import { XMLParser } from "fast-xml-parser";

export interface IntentDetectResult {
  featureId: string;
  parameters?: Record<string, string | null>;
  options?: Record<string, string | null>;
  reasoning?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: true
});

const normalizeRecord = (value: unknown): Record<string, string | null> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([key, raw]) => {
    const normalized = raw == null ? null : String(raw);
    return [key, normalized === "null" ? null : normalized];
  });

  return Object.fromEntries(entries);
};

export const parseIntentDetectResult = (llmResponse: string): IntentDetectResult => {
  const cleaned = llmResponse.replace(/```xml|```/g, "").trim();
  const xml = `<noon>${cleaned}</noon>`;
  const parsed = parser.parse(xml) as {
    noon?: {
      feature?: string | number;
      parameters?: unknown;
      options?: unknown;
      reasoning?: string;
    };
  };

  const root = parsed.noon;
  const featureId = root?.feature == null ? "0" : String(root.feature);

  return {
    featureId,
    reasoning: root?.reasoning,
    parameters: normalizeRecord(root?.parameters),
    options: normalizeRecord(root?.options)
  };
};
