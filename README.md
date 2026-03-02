# node-agent-server

Node.js/TypeScript 기반의 내부 AI 에이전트 서버입니다.
상위 API 서버에서 1차 검증을 수행한 뒤, 이 서버는 LLM 처리/응답 생성에 집중합니다.

## API

- `GET /health`
- `GET /api/v1/ping`
- `POST /api/v1/chat/reply`
- `POST /api/v1/intent/detect` (호환용 폴백)
- Swagger UI: `http://localhost:8889/docs`

## 실행

```bash
npm install
npm run dev
```

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
- `/api/v1/intent/detect`: 기존 인텐트 감지 응답 유지

## 성능 최적화

- 요청 본문은 경량 파서로 필수 필드만 검사합니다.
- 모델 인스턴스는 `model + temperature` 기준 캐시합니다.
- `IntentDetector`, `ChatResponder` 인스턴스도 모델별 캐시합니다.
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
- `AGENT_HMAC_ENABLED` (기본: `true`)
- `AGENT_HMAC_KEY_ID` (HMAC 활성 시 필수)
- `AGENT_HMAC_SECRET` (HMAC 활성 시 필수)
- `AGENT_HMAC_TTL_SEC` (기본: `60`)
- `AGENT_HMAC_NONCE_TTL_SEC` (기본: `90`)
- `INTENT_DETECT_DEFAULT_MODEL` (기본: `openai:gpt-4o-mini`)
- `INTENT_DETECT_TIMEOUT_MS` (기본: `4500`)
- `INTENT_DETECT_RETRY_COUNT` (기본: `1`)
- `CHAT_RESPOND_TIMEOUT_MS` (기본: `8000`)
- `CHAT_RESPOND_RETRY_COUNT` (기본: `1`)
- `LOG_LEVEL` (개발 기본: `debug`, 운영 기본: `info`)
