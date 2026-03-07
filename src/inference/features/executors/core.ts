import type { FeatureExecutor } from "../../pipeline/inferenceTypes.js";
import { getWeatherData } from "./weatherService.js";

const directResponse = (answer: string) => ({
  answer,
  modelName: "feature-executor"
});

export const saveMemoryExecutor: FeatureExecutor = {
  id: "mem.save",
  async run({ selection }) {
    const memo = selection.parsed?.parameters?.memo_content ?? "user asked to save memory";
    const targetDate = selection.parsed?.parameters?.target_date ?? "null";
    return {
      directResponse: directResponse(`기억할 내용을 저장할게요.\n\n- 내용: ${memo}\n- 날짜: ${targetDate}`),
      metadata: { action: "mem.save", memo, targetDate }
    };
  }
};

export const weatherLookupExecutor: FeatureExecutor = {
  id: "weather.lookup",
  async run({ state, selection }) {
    const city = selection.parsed?.parameters?.city ?? null;
    try {
      const weatherData = await getWeatherData({
        city,
        viewerAddress: state.normalizedState.viewerAddress,
        viewerCity: state.normalizedState.viewerCity,
        viewerLat: state.normalizedState.viewerLat,
        viewerLon: state.normalizedState.viewerLon
      });

      const today = weatherData.forecastDays[0];
      const tomorrow = weatherData.forecastDays[1];
      const lines = [
        `${weatherData.city}의 현재 날씨입니다.`,
        `현재 기온 ${weatherData.tempC}°C, 날씨는 ${weatherData.description}, 습도는 ${weatherData.humidity}%입니다.`,
        today
          ? `오늘은 ${today.conditionText}이며 최고 ${today.maxtempC ?? "-"}°C, 최저 ${today.mintempC ?? "-"}°C 예상입니다.`
          : "",
        tomorrow
          ? `내일은 ${tomorrow.conditionText}이며 최고 ${tomorrow.maxtempC ?? "-"}°C, 최저 ${tomorrow.mintempC ?? "-"}°C 예상입니다.`
          : ""
      ].filter(Boolean);

      return {
        directResponse: directResponse(lines.join("\n\n")),
        metadata: {
          action: "weather.lookup",
          city,
          weatherData,
          locationSource:
            city ? "city_parameter" : state.normalizedState.viewerCity ? "viewer_city" : state.normalizedState.viewerLat ? "viewer_coordinates" : state.normalizedState.viewerAddress ? "viewer_ip" : "default"
        }
      };
    } catch (error) {
      return {
        metadata: {
          action: "weather.lookup",
          city,
          weatherLookupFailed: true,
          error: error instanceof Error ? error.message : String(error),
          locationSource:
            city ? "city_parameter" : state.normalizedState.viewerCity ? "viewer_city" : state.normalizedState.viewerLat ? "viewer_coordinates" : state.normalizedState.viewerAddress ? "viewer_ip" : "default"
        }
      };
    }
  }
};

export const placeSearchExecutor: FeatureExecutor = {
  id: "place.search.nearby",
  async run({ selection, state }) {
    const query = selection.parsed?.parameters?.query ?? "nearby places";
    const address = selection.parsed?.parameters?.target_address ?? "viewer location";
    return {
      directResponse: directResponse(
        `장소 검색 의도로 인식했어요.\n\n- 검색어: ${query}\n- 기준 위치: ${address}\n\n실제 장소 데이터 연동이 아직 없어 상세 검색 결과는 제공할 수 없습니다.`
      ),
      metadata: { action: "place.search.nearby", query, address }
    };
  }
};

export const recipeExecutor: FeatureExecutor = {
  id: "recipe.suggest.from_ingredients",
  async run({ state }) {
    return {
      directResponse: directResponse(
        `레시피 추천 의도로 인식했어요.\n\n현재 연결된 재료 데이터가 없어 일반 답변만 가능합니다.\n이미지 설명: ${state.normalizedState.imageDescription ?? "없음"}`
      ),
      metadata: { action: "recipe.suggest.from_ingredients" }
    };
  }
};

export const defaultExecutors: FeatureExecutor[] = [
  saveMemoryExecutor,
  weatherLookupExecutor,
  placeSearchExecutor,
  recipeExecutor
];
