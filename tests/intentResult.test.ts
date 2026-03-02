import { describe, expect, it } from "vitest";
import { parseIntentDetectResult } from "../src/intent/intentResult.js";

describe("parseIntentDetectResult", () => {
  it("parses feature and parameters", () => {
    const xml = `
<reasoning>User explicitly asked for weather in Seoul.</reasoning>
<feature>2_a</feature>
<parameters>
  <city>Seoul</city>
</parameters>`;

    const result = parseIntentDetectResult(xml);
    expect(result.featureId).toBe("2_a");
    expect(result.parameters).toEqual({ city: "Seoul" });
    expect(result.reasoning).toContain("weather");
  });

  it("defaults to feature 0 when feature is missing", () => {
    const result = parseIntentDetectResult("<reasoning>None</reasoning>");
    expect(result.featureId).toBe("0");
  });
});
