import type { Feature } from "./feature.js";

export class FeatureRegistry {
  private readonly instances = new Map<string, Feature>();
  private readonly legacyInstances = new Map<string, Feature>();

  register(feature: Feature): Feature {
    this.instances.set(feature.id, feature);
    if (feature.legacyId) {
      this.legacyInstances.set(feature.legacyId, feature);
    }
    return feature;
  }

  getAll(): Feature[] {
    return [...this.instances.values()];
  }

  getById(id: string): Feature | undefined {
    return this.instances.get(id);
  }

  resolve(idOrLegacyId: string): Feature | undefined {
    return this.instances.get(idOrLegacyId) ?? this.legacyInstances.get(idOrLegacyId);
  }

  listFeatures(): string[] {
    return this.getAll().map((feature) => `${feature.id}: ${feature.title}`);
  }
}

let singleton: FeatureRegistry | undefined;

export const getFeatureRegistry = (): FeatureRegistry => {
  if (!singleton) {
    singleton = new FeatureRegistry();
  }
  return singleton;
};
