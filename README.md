# node-agent-server

Node.js/TypeScript 기반의 내부 AI 추론 서버입니다.
상위 API 서버가 요청 검증과 제품 레벨 상태 관리를 담당하고, 이 서버는 인텐트 감지, feature 실행, 일반 LLM 응답 생성을 수행합니다.

## API

- `GET /health`
- `GET /api/v1/ping`
- `POST /api/v1/chat/reply`
- `POST /api/v1/chat/reply-with-intent`
- `POST /api/v1/chat/reply-with-intent/stream`
- `POST /api/v1/intent/detect`
- Swagger UI: `http://localhost:8889/docs`

## 실행

```bash
npm install
npm run dev
```

`.env` 파일은 서버 시작 시 자동으로 로드됩니다.

## 개요

- Fastify 기반 HTTP API 서버입니다.
- 요청을 받아 인텐트 감지 후 feature 실행 또는 일반 답변 생성 경로로 분기합니다.
- 일부 엔드포인트는 SSE 응답을 지원합니다.
- `/api/v1/*` 경로는 HMAC 기반 내부 인증을 사용합니다.

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

## 요청 예시

```bash
curl -X POST http://localhost:8889/api/v1/chat/reply \
  -H 'Content-Type: application/json' \
  -H 'x-key-id: your-key-id' \
  -H 'x-timestamp: 1730000000' \
  -H 'x-nonce: nonce-123' \
  -H 'x-signature: <hex-signature>' \
  -d '{
    "model": "google-genai:gemini-2.5-flash-lite",
    "session": {
      "id": "chat_session_id",
      "userId": "user_123",
      "tenantId": "tenant_a",
      "serviceId": "saju-service"
    },
    "state": {
      "messages": [
        { "role": "user", "content": "오늘 날씨 알려줘" }
      ],
      "viewerTimezone": "Asia/Seoul"
    }
  }'
```

## 응답

- `/api/v1/chat/reply`: 답변만 반환
- `/api/v1/chat/reply-with-intent`: 답변과 인텐트 정보를 함께 반환
- `/api/v1/chat/reply-with-intent/stream`: SSE 이벤트를 반환
- `/api/v1/intent/detect`: 인텐트 감지만 수행

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
- `CORS_ENABLED` (기본: `false`)
- `CORS_ORIGIN`
- `DEFAULT_MODEL` (기본: `google-genai:gemini-2.5-flash-lite`)
- `INTENT_DETECT_ALLOW_FALLBACK` (기본: `false`)
- `INTENT_DETECT_TIMEOUT_MS` (기본: `4500`)
- `CHAT_RESPOND_TIMEOUT_MS` (기본: `8000`)
- `OPENWEATHERMAP_API_KEY` (날씨 feature 사용 시 필요)
- `LOG_LEVEL` (개발 기본: `debug`, 운영 기본: `info`)

## 비고

- 이 저장소는 내부 서비스용 추론 서버를 목표로 합니다.
- 상세한 시스템 경계, 서버 간 계약, 내부 상태 관리 문서는 공개 README가 아니라 내부 문서에서 관리하는 것을 권장합니다.
