# node-agent-server

Node.js/TypeScript 기반의 내부 AI 에이전트 서버입니다.
상위 API 서버에서 1차 검증을 수행한 뒤, 이 서버는 LLM 처리/응답 생성에 집중합니다.

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
- `/api/v1/chat/reply`: 내부적으로 추론 파이프라인을 실행한 뒤 `answer`, `modelName`, `finishReason`, `usage`만 반환
- `/api/v1/chat/reply-with-intent`: 같은 추론 파이프라인 결과에 `intent`, `intentStatus`, `path`, `timings`를 함께 반환
- `/api/v1/chat/reply-with-intent/stream`: SSE 이벤트(`message.start`, `message.delta`, `message.end`, `intent.result`, `done`) 반환
- `/api/v1/intent/detect`: 답변 생성 없이 인텐트 감지만 수행
- Gemini 쿼터 초과 시(`429`)는 `RATE_LIMITED` 오류와 함께 즉시 반환됩니다.

## 추론 파이프라인

모든 채팅 API는 같은 추론 파이프라인을 사용합니다.

1. 요청 파싱 및 위치/IP fallback 적용
2. agent context 초기화
3. history / user memory 로드
4. intent detect
5. feature 분기
6. feature executor가 직접 처리 가능하면 그 결과를 최종 응답으로 사용
7. feature 미분류 또는 feature 실행 실패 시에만 answer LLM 호출

현재 `chat/reply`와 `chat/reply-with-intent`의 내부 로직은 같고, 응답 계약만 다릅니다.

- `chat/reply`: 답변 필드만 노출
- `reply-with-intent`: intent와 path/timings까지 노출
- `reply-with-intent/stream`: 같은 파이프라인의 SSE 버전

`path` 값 의미:

- `answer_llm`: feature 미분류로 일반 답변 LLM 사용
- `feature_success`: feature executor가 직접 처리 성공
- `feature_failed`: feature로 분기했지만 실행 실패 후 일반 답변 경로로 복귀

현재 기본 feature 예시는 날씨 조회, 메모 저장, 주변 장소 검색, 재료 기반 레시피 추천입니다.

## 시간대 처리

- 요청의 `state.viewerTimezone`을 받으면 서버가 그 시간대로 현재 날짜/시간을 계산합니다.
- 계산된 `currentDateTime`, `currentDate`, `currentTime`, `currentTimezone`는 추론 state에 주입됩니다.
- intent 분석과 일반 답변 생성 모두 이 값을 기준으로 `today`, `tomorrow`, `now` 같은 상대 시각을 해석합니다.
- 유효하지 않은 timezone이 오면 서버 기본 timezone으로 fallback합니다.

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
- `DEFAULT_MODEL` (기본: `google-genai:gemini-2.5-flash-lite`, 레거시 `INTENT_DETECT_DEFAULT_MODEL`도 fallback으로 지원)
- `INTENT_DETECT_ALLOW_FALLBACK` (기본: `false`, `true`면 감지 실패 시 featureId=`0` 폴백)
- `INTENT_DETECT_TIMEOUT_MS` (기본: `4500`)
- `CHAT_RESPOND_TIMEOUT_MS` (기본: `8000`)
- `OPENWEATHERMAP_API_KEY` (날씨 feature 사용 시 필요)
- `LOG_LEVEL` (개발 기본: `debug`, 운영 기본: `info`)
