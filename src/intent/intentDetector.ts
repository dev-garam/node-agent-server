import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { FastifyBaseLogger } from "fastify";
import type { ChatState } from "../types/chat.js";
import type { Feature } from "./feature.js";
import { parseIntentDetectResult, type IntentDetectResult } from "./intentResult.js";
import { createChatModel } from "./modelFactory.js";
import { PromptMaker, ConversationContextMaker } from "./promptMaker.js";
import type { FeatureRegistry } from "./registry.js";

export interface IntentDetectionInput {
  state: ChatState;
  additionalFeatures?: Feature[];
}

export interface IntentDetectionOutput {
  rawResponse: string;
  parsed: IntentDetectResult;
}

export class IntentDetector {
  private readonly promptMaker: PromptMaker;

  constructor(
    private readonly registry: FeatureRegistry,
    private readonly modelName: string,
    private readonly logger?: FastifyBaseLogger
  ) {
    this.promptMaker = new PromptMaker(this.registry);
  }

  async detect(input: IntentDetectionInput): Promise<IntentDetectionOutput> {
    this.logger?.info(
      {
        model: this.modelName,
        messageCount: input.state.messages.length
      },
      "intent.detect.start"
    );

    const model = await createChatModel({ model: this.modelName, temperature: 0 });
    const prompt = this.promptMaker.getIntentDetectionPrompt(input.additionalFeatures ?? []);
    const context = new ConversationContextMaker(input.state).getConversationContext();

    const response = await model.invoke([
      new SystemMessage(prompt),
      new HumanMessage(context)
    ]);

    const rawResponse = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

    const output = {
      rawResponse,
      parsed: parseIntentDetectResult(rawResponse)
    };

    this.logger?.info(
      {
        model: this.modelName,
        featureId: output.parsed.featureId
      },
      "intent.detect.done"
    );

    return output;
  }
}
