import { describe, expect, it } from "vitest";
import { buildMockReplyWithIntent, buildMockStreamEvents } from "../src/testing/mockAgentResponses.js";

describe("mockAgentResponses", () => {
  it("builds deterministic weather_success reply", () => {
    const output = buildMockReplyWithIntent("google-genai:gemini-2.5-flash-lite", "weather_success");
    expect(output.path).toBe("feature_success");
    expect(output.intent?.parsed.featureId).toBe("weather.lookup");
    expect(output.answer).toContain("용인시");
  });

  it("builds stream_error events with error payload", () => {
    const events = buildMockStreamEvents("google-genai:gemini-2.5-flash-lite", "stream_error", "req_mock");
    expect(events[0]?.type).toBe("message.start");
    expect(events[1]?.type).toBe("message.delta");
    expect(events[2]?.type).toBe("error");
    if (events[2]?.type === "error") {
      expect(events[2].data.code).toBe("AGENT_UNAVAILABLE");
      expect(events[2].data.requestId).toBe("req_mock");
    }
  });
});
