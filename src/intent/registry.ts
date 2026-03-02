import type { Feature } from "./feature.js";

export class FeatureRegistry {
  private readonly instances = new Map<string, Feature>();

  register(feature: Feature): Feature {
    this.instances.set(feature.id, feature);
    return feature;
  }

  getAll(): Feature[] {
    return [...this.instances.values()];
  }

  getById(id: string): Feature | undefined {
    return this.instances.get(id);
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
