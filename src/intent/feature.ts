export type ParameterType = "text" | "array_text" | "date" | "date_range" | "image" | "enum" | "boolean";

export interface RequiredParameter {
  name: string;
  type: ParameterType;
  required: boolean;
  extractionNote: string;
  enum?: string[];
}

export interface CandidateOption {
  name: string;
  description: string;
}

export interface AvailableOption {
  name: string;
  required: boolean;
  choicePrompt: string;
  candidates: CandidateOption[];
}

export interface Feature {
  id: string;
  legacyId?: string;
  title: string;
  description: string;
  detectionNote: string;
  requiredParameters: RequiredParameter[];
  availableOptions: AvailableOption[];
}

export const featurePrompt = (feature: Feature): string => {
  let prompt = `\n**${feature.title}**\n   - Feature ID: ${feature.id}\n   - Feature Criteria: ${feature.detectionNote}\n`;
  if (feature.legacyId) {
    prompt += `   - Legacy Feature ID: ${feature.legacyId}\n`;
  }

  if (feature.requiredParameters.length > 0) {
    prompt += "   - Required Parameters:\n";
    for (const param of feature.requiredParameters) {
      prompt += `    + ${param.name}${param.required ? "" : " (Optional)"}\n`;
      prompt += `      Parameter Criteria: ${param.extractionNote}\n`;
      if (param.type === "enum" && param.enum?.length) {
        prompt += `      Parameter ENUM: ${param.enum.join(" / ")}\n`;
      }
    }
  }

  if (feature.availableOptions.length > 0) {
    prompt += "   - Selectable Parameters:\n";
    for (const option of feature.availableOptions) {
      prompt += `    + ${option.name}${option.required ? " (required)" : ""}\n`;
      prompt += `      Parameter Criteria: ${option.choicePrompt}\n`;
      prompt += "      Parameter Candidates:\n";
      option.candidates.forEach((candidate, index) => {
        prompt += `        ${index + 1}. ${candidate.name} : ${candidate.description}\n`;
      });
    }
  }

  return prompt;
};
