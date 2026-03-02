import { describe, expect, it } from "vitest";
import { defaultFeatures } from "../src/features/core.js";
import { PromptMaker, ConversationContextMaker } from "../src/intent/promptMaker.js";
import { FeatureRegistry } from "../src/intent/registry.js";

describe("prompt maker", () => {
  it("includes feature ids in prompt", () => {
    const registry = new FeatureRegistry();
    defaultFeatures.forEach((feature) => registry.register(feature));

    const prompt = new PromptMaker(registry).getIntentDetectionPrompt();

    expect(prompt).toContain("Feature ID: mem.save");
    expect(prompt).toContain("Feature ID: weather.lookup");
    expect(prompt).toContain("Feature ID: 0");
  });

  it("marks latest user message with LAST tag", () => {
    const context = new ConversationContextMaker({
      messages: [
        { role: "user", content: "안녕" },
        { role: "assistant", content: "무엇을 도와드릴까요?" },
        { role: "user", content: "서울 날씨 알려줘" }
      ]
    }).getConversationContext();

    expect(context).toContain("<LAST>서울 날씨 알려줘</LAST>");
  });
});
