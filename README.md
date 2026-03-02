# node-agent-server

Node.js/TypeScript 기반의 AI 에이전트 서버입니다.

## 핵심 구성

- LangChain 기반 LLM 호출 (`IntentDetector`)
- Feature registry + prompt 조합
- XML 응답 파싱
- Fastify API (`POST /api/v1/intent/detect`)

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
