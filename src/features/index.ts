import type { FeatureRegistry } from "../intent/registry.js";
import { defaultFeatures } from "./core.js";

export const registerDefaultFeatures = (registry: FeatureRegistry): void => {
  for (const feature of defaultFeatures) {
    registry.register(feature);
  }
};
