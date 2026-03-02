import type { Feature } from "../intent/feature.js";

export const saveUserMemoryFeature: Feature = {
  id: "mem.save",
  title: "Save a new memo on user's memory",
  description: "Stores user-provided information to memory for future conversation.",
  detectionNote:
    "Execute only when the user explicitly asks to save information. Do not use for schedules, reminders, or ambiguous statements.",
  requiredParameters: [
    {
      name: "memo_content",
      type: "text",
      required: true,
      extractionNote:
        "Summarize the memory content in 2 sentences or less. If time exists, exclude it from memo_content."
    },
    {
      name: "target_date",
      type: "date",
      required: false,
      extractionNote: "If present, extract date in YYYY-MM-DD hh:mm AM/PM format."
    }
  ],
  availableOptions: []
};

export const searchWeatherFeature: Feature = {
  id: "weather.lookup",
  title: "Provide weather information",
  description: "Returns weather info for a current or specific location.",
  detectionNote:
    "Execute only when the user directly asks for weather-related information such as weather, rain, air quality, or temperature.",
  requiredParameters: [
    {
      name: "city",
      type: "text",
      required: false,
      extractionNote: "Extract city in English only. If not specified, return null."
    }
  ],
  availableOptions: []
};

export const searchNearbyLocationFeature: Feature = {
  id: "place.search.nearby",
  title: "Provide searched location information",
  description: "Returns nearby place search results.",
  detectionNote:
    "Execute only when user explicitly asks to search locations with a concrete query.",
  requiredParameters: [
    {
      name: "query",
      type: "text",
      required: true,
      extractionNote: "Extract essential place-search query terms from context."
    },
    {
      name: "target_address",
      type: "text",
      required: false,
      extractionNote: "Extract target address when user specifies it, else null."
    }
  ],
  availableOptions: []
};

export const provideRecipeFeature: Feature = {
  id: "recipe.suggest.from_ingredients",
  title: "Provide a recipe from user-provided ingredients",
  description: "Suggests recipes when user asks with ingredient context.",
  detectionNote:
    "Execute only when user explicitly asks for recipe recommendation and relevant ingredients are present.",
  requiredParameters: [],
  availableOptions: []
};

export const defaultFeatures: Feature[] = [
  saveUserMemoryFeature,
  searchWeatherFeature,
  searchNearbyLocationFeature,
  provideRecipeFeature
];
