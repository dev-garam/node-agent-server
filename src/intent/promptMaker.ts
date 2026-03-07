import type { ChatState } from "../types/chat.js";
import type { Feature } from "./feature.js";
import { featurePrompt } from "./feature.js";
import type { FeatureRegistry } from "./registry.js";
import { AVAILABLE_FEATURES_PROMPT, BASE_PROMPT, MAIN_PROMPT } from "./staticPrompts.js";

export class PromptMaker {
  private readonly basePromptPrefix: string;
  private readonly cachedPrompt: string;

  constructor(private readonly registry: FeatureRegistry) {
    const baseFeaturesPrompt = this.registry.getAll().map(featurePrompt).join("");
    this.basePromptPrefix = `${BASE_PROMPT}${AVAILABLE_FEATURES_PROMPT}${baseFeaturesPrompt}`;
    this.cachedPrompt = `${this.basePromptPrefix}${MAIN_PROMPT}`;
  }

  getIntentDetectionPrompt(additionalFeatures: Feature[] = []): string {
    if (additionalFeatures.length === 0) {
      return this.cachedPrompt;
    }
    const additionalPrompt = additionalFeatures.map(featurePrompt).join("");
    return `${this.basePromptPrefix}${additionalPrompt}${MAIN_PROMPT}`;
  }
}

export class ConversationContextMaker {
  constructor(private readonly state: ChatState) {}

  getConversationContext(): string {
    const currentFeatureId = this.state.currentFeature?.id;
    const currentDatetime = this.state.currentDateTime ?? new Date().toISOString();
    const currentDate = this.state.currentDate;
    const currentTime = this.state.currentTime;
    const currentTimezone = this.state.currentTimezone ?? this.state.viewerTimezone;

    const header = [
      currentFeatureId ? `- **Current Feature ID**: ${currentFeatureId}` : "",
      `- **Current Datetime**: ${currentDatetime}`,
      currentDate ? `- **Current Date**: ${currentDate}` : "",
      currentTime ? `- **Current Time**: ${currentTime}` : "",
      currentTimezone ? `- **Current Timezone**: ${currentTimezone}` : "",
      this.state.imageDescription ? `- **Image Description**: ${this.state.imageDescription}` : "",
      this.userMemorySection(),
      ""
    ]
      .filter(Boolean)
      .join("\n");

    const lastImageIdx = this.findLastImageDescriptionIndex();
    const conversation = this.state.messages
      .map((message, index) => {
        const role = message.role === "user" ? "HUMAN" : "AI";
        const taggedContent = index === this.state.messages.length - 1 ? `<LAST>${message.content}</LAST>` : message.content;
        const line = `- ${role}: ${taggedContent}`;

        if (lastImageIdx === index && message.role === "user" && message.imageDescription) {
          return `${line}\n- HUMAN_ATTACHED_IMAGE: <image_description>${message.imageDescription}</image_description>`;
        }

        return line;
      })
      .join("\n");

    return `${header}${conversation}`;
  }

  private findLastImageDescriptionIndex(): number | undefined {
    for (let index = this.state.messages.length - 1; index >= 0; index -= 1) {
      const message = this.state.messages[index];
      if (message.role === "user" && message.imageDescription) {
        return index;
      }
    }
    return undefined;
  }

  private userMemorySection(): string {
    const memories = this.state.userMemory ?? [];
    if (memories.length === 0) {
      return "\n## User Memory\n- null";
    }

    const lines = memories.map((memory) => {
      const targetDate = memory.targetDate ?? "null";
      return `- [content: ${memory.content}, target_date: ${targetDate}] (redis_key: ${memory.key})`;
    });

    return `\n## User Memory\n${lines.join("\n")}`;
  }
}
