import { describe, expect, it } from "vitest";
import { defaultFeatures } from "../src/features/core.js";
import { FeatureRegistry } from "../src/intent/registry.js";

describe("FeatureRegistry", () => {
  it("registers and resolves by id", () => {
    const registry = new FeatureRegistry();
    defaultFeatures.forEach((feature) => registry.register(feature));

    expect(registry.getById("place.search.nearby")?.title).toContain("location");
    expect(registry.resolve("3_a")?.id).toBe("place.search.nearby");
    expect(registry.listFeatures().length).toBe(4);
  });
});
