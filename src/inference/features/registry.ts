import type { FeatureExecutor } from "../pipeline/inferenceTypes.js";

export class FeatureExecutorRegistry {
  private readonly executors = new Map<string, FeatureExecutor>();

  register(executor: FeatureExecutor): void {
    this.executors.set(executor.id, executor);
  }

  get(id: string): FeatureExecutor | undefined {
    return this.executors.get(id);
  }
}

