import { pathToFileURL } from "node:url";
import type { Feature } from "../intent/feature.js";

interface DynamicFeatureModule {
  feature?: Feature;
  default?: Feature;
}

export const loadFeaturesByIds = async (
  requestedIds: string[],
  featureFilePaths: string[]
): Promise<Feature[]> => {
  if (requestedIds.length === 0 || featureFilePaths.length === 0) {
    return [];
  }

  const remaining = new Set(requestedIds);
  const loaded: Feature[] = [];

  for (const filePath of featureFilePaths) {
    if (remaining.size === 0) {
      break;
    }

    try {
      const imported = (await import(pathToFileURL(filePath).href)) as DynamicFeatureModule;
      const feature = imported.feature ?? imported.default;
      if (!feature) {
        continue;
      }

      if (remaining.has(feature.id)) {
        loaded.push(feature);
        remaining.delete(feature.id);
      }
    } catch {
      // Ignore bad modules to keep dynamic loading resilient.
    }
  }

  return loaded;
};
