# node-agent-server

Node.js/TypeScript 기반의 내부 AI 에이전트 서버입니다.
상위 API 서버에서 1차 검증을 수행한 뒤, 이 서버는 LLM 처리/응답 생성에 집중합니다.

## API

- `GET /health`
- `GET /api/v1/ping`
- `POST /api/v1/chat/reply`
- `POST /api/v1/chat/reply-with-intent/stream` (SSE: 답변 토큰 스트림 + 인텐트 결과)
- `POST /api/v1/chat/reply-with-intent` (답변 우선 반환 + 인텐트 병렬 처리)
- `POST /api/v1/intent/detect` (호환용 폴백)
- Swagger UI: `http://localhost:8889/docs`

## 실행

```bash
npm install
npm run dev
```

`.env` 파일은 서버 시작 시 자동으로 로드됩니다.

## Swagger 빠른 테스트

- 로컬에서 Swagger `Try it out`으로 바로 호출하려면 `.env`에 `AGENT_HMAC_ENABLED=false`를 설정하세요.
- HMAC을 켠 상태에서는 `x-key-id`, `x-timestamp`, `x-nonce`, `x-signature` 헤더를 모두 올바르게 넣어야 합니다.

## S2S HMAC 헤더

모든 `/api/v1/*` 요청은 아래 헤더가 필요합니다.

- `x-key-id`
- `x-timestamp` (UNIX epoch seconds)
- `x-nonce`
- `x-signature` (HMAC-SHA256 hex)

서명 문자열:

```text
{method}\n{path}\n{timestamp}\n{nonce}\n{sha256(body)}
```

## 요청 예시 (`/api/v1/chat/reply`)

```bash
curl -X POST http://localhost:8889/api/v1/chat/reply \
  -H 'Content-Type: application/json' \
  -H 'x-key-id: your-key-id' \
  -H 'x-timestamp: 1730000000' \
  -H 'x-nonce: nonce-123' \
  -H 'x-signature: <hex-signature>' \
  -d '{
    "session": {
      "id": "chat_session_id",
      "userId": "user_123",
      "tenantId": "tenant_a",
      "serviceId": "saju-service"
    },
    "state": {
      "messages": [
        { "role": "user", "content": "오늘 운세 알려줘" }
      ],
      "viewerTimezone": "Asia/Seoul"
    }
  }'
```

## 응답 동작

- `/api/v1/ping`: `{ "status": "ok" }`
- `/api/v1/chat/reply`: `answer` 필수, `modelName`, `finishReason`, `usage` optional
- `/api/v1/chat/reply-with-intent/stream`: SSE 이벤트(`message.start`, `message.delta`, `message.end`, `intent.result`, `done`)
- `/api/v1/chat/reply-with-intent`: `answer`를 우선 반환하고, 같은 응답에서 `intent`는 완료 시 포함되며 미완료면 `intent: null`, `intentStatus: "pending"` 반환
- `/api/v1/intent/detect`: 기존 인텐트 감지 응답 유지
- Gemini 쿼터 초과 시(`429`)는 `RATE_LIMITED` 오류와 함께 즉시 반환됩니다.

## 성능 최적화

- 요청 본문은 경량 파서로 필수 필드만 검사합니다.
- 모델 인스턴스는 `model + temperature` 기준 캐시합니다.
- `IntentDetector`, `ChatResponder` 인스턴스도 모델별 캐시합니다.
- 기본 feature 프롬프트는 시작 시 1회 생성 후 재사용합니다.
- 타임아웃으로 지연 상한을 제어합니다.

## 로그 동작

- Fastify 기본 `request completed` 자동 로그는 비활성화되어 있습니다.
- 개발 환경은 `pino-pretty` 포맷으로 출력됩니다.
- 요청 상세 로그는 `debug`, 결과 로그는 `info`, 에러는 `error` 레벨로 출력됩니다.

## 환경 변수

- OpenAI 계열: `OPENAI_API_KEY`
- Google 계열: `GOOGLE_API_KEY`
- (선택) Gemini 별칭: `GEMINI_API_KEY`
- Anthropic 계열: `ANTHROPIC_API_KEY`
- `AGENT_HMAC_ENABLED` (기본: `true`)
- `AGENT_HMAC_KEY_ID` (HMAC 활성 시 필수)
- `AGENT_HMAC_SECRET` (HMAC 활성 시 필수)
- `AGENT_HMAC_TTL_SEC` (기본: `60`)
- `AGENT_HMAC_NONCE_TTL_SEC` (기본: `90`)
- `CORS_ENABLED` (기본: `false`, 서버-서버 통신이면 보통 비활성화)
- `CORS_ORIGIN` (예: `https://admin.example.com,https://stg-admin.example.com`)
- `INTENT_DETECT_DEFAULT_MODEL` (기본: `google-genai:gemini-2.5-flash-lite`)
- `INTENT_DETECT_ALLOW_FALLBACK` (기본: `false`, `true`면 감지 실패 시 featureId=`0` 폴백)
- `INTENT_DETECT_TIMEOUT_MS` (기본: `4500`)
- `CHAT_RESPOND_TIMEOUT_MS` (기본: `8000`)
- `LOG_LEVEL` (개발 기본: `debug`, 운영 기본: `info`)
