# node-agent-server

Node.js/TypeScript 기반의 내부 AI 에이전트 서버입니다.
상위 API 서버에서 1차 검증을 수행한 뒤, 이 서버는 인텐트 감지에 집중합니다.

## API

- `GET /health`
- `POST /api/v1/intent/detect`
- Swagger UI: `http://localhost:3000/docs`

## 실행

```bash
npm install
npm run dev
```

## 요청 예시

```bash
curl -X POST http://localhost:3000/api/v1/intent/detect \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "openai:gpt-4o-mini",
    "state": {
      "messages": [
        { "role": "user", "content": "서울 날씨 알려줘" }
      ]
    }
  }'
```

## Feature IDs

- `mem.save`
- `weather.lookup`
- `place.search.nearby`
- `recipe.suggest.from_ingredients`

## 응답 동작

- `matchedFeature`에는 `id`, `title`을 반환합니다.
- 모델 호출 실패 시 재시도 후 `featureId: "0"`으로 폴백합니다.

## 성능 최적화

- 요청 본문은 경량 파서로 필수 필드만 검사합니다.
- 모델 인스턴스는 `model + temperature` 기준 캐시합니다.
- `IntentDetector` 인스턴스도 모델별 캐시합니다.
- 기본 feature 프롬프트는 시작 시 1회 생성 후 재사용합니다.
- 타임아웃/재시도로 지연 상한을 제어합니다.

## 로그 동작

- Fastify 기본 `request completed` 자동 로그는 비활성화되어 있습니다.
- 개발 환경은 `pino-pretty` 포맷으로 출력됩니다.
- 요청 상세 로그는 `debug`, 결과 로그는 `info`, 에러는 `error` 레벨로 출력됩니다.

## 환경 변수

- OpenAI 계열: `OPENAI_API_KEY`
- Google 계열: `GOOGLE_API_KEY`
- Anthropic 계열: `ANTHROPIC_API_KEY`
- `INTENT_DETECT_DEFAULT_MODEL` (기본: `openai:gpt-4o-mini`)
- `INTENT_DETECT_TIMEOUT_MS` (기본: `4500`)
- `INTENT_DETECT_RETRY_COUNT` (기본: `1`)
- `LOG_LEVEL` (개발 기본: `debug`, 운영 기본: `info`)
