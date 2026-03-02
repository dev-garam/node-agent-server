# node-agent-server

Node.js/TypeScript 기반의 AI 에이전트 서버입니다.

## 핵심 구성

- LangChain 기반 LLM 호출 (`IntentDetector`)
- Feature registry + prompt 조합
- XML 응답 파싱
- Fastify API (`POST /api/v1/intent/detect`)
- 경량 요청 파서(필수 필드만 체크)
- 모델/디텍터/프롬프트 캐시 기반 저지연 처리
- 타임아웃/재시도/폴백(`featureId: 0`) 내장

## Feature IDs

- `mem.save` (legacy: `1_a`)
- `weather.lookup` (legacy: `2_a`)
- `place.search.nearby` (legacy: `3_a`)
- `recipe.suggest.from_ingredients` (legacy: `4_b`)

## 실행

```bash
npm install
npm run dev
```

Swagger UI: `http://localhost:3000/docs`

### 요청 예시

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

## 환경 변수

사용 모델 provider에 맞춰 LangChain에서 요구하는 키를 설정하세요.

- OpenAI 계열: `OPENAI_API_KEY`
- Google 계열: `GOOGLE_API_KEY`
- Anthropic 계열: `ANTHROPIC_API_KEY`
- `INTENT_DETECT_DEFAULT_MODEL` (기본: `openai:gpt-4o-mini`)
- `INTENT_DETECT_TIMEOUT_MS` (기본: `4500`)
- `INTENT_DETECT_RETRY_COUNT` (기본: `1`)

## 성능 동작

- 요청마다 모델을 재생성하지 않고 모델별 캐시를 재사용합니다.
- 디텍터 인스턴스도 모델별로 캐시합니다.
- 기본 feature 프롬프트는 서버 시작 후 1회 생성해 재사용합니다.
- 인텐트 감지 실패 시 재시도 후 `featureId: 0`으로 안전 폴백합니다.
