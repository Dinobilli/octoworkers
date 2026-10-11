# 새 프로젝트: 카카오 회원 + 그로블 결제

이 저장소는 재사용하는 보일러플레이트입니다. 실제 서비스의 키, 상품, 도메인, Cloudflare 리소스를 포함하지 않습니다. 카카오와 그로블은 기본으로 꺼져 있으며 프로젝트별로 선택합니다.

## 프로젝트 만들기

Node.js 22.18 LTS 또는 24.11 이상, pnpm 9.15.0을 사용합니다. 이 포크의 CLI는 npm에 발행하지 않았습니다.

```sh
pnpm install --frozen-lockfile
pnpm build:cli
node cli/dist/index.mjs ../my-service --yes --scope my-team --domain example.com --email owner@example.com --kakao --groble
cd ../my-service
pnpm install --frozen-lockfile
pnpm --filter @my-team/worker db:migrate:local
pnpm admin:bootstrap --email owner@example.com
pnpm dev
```

CLI는 빈 디렉터리에만 생성합니다. 로컬 비밀번호는 `worker/.dev.vars`에 새로 생성하며, 키·클라우드 리소스·배포를 자동으로 만들지 않습니다. GitHub, Kakao, Groble 공급자 계정은 프로젝트마다 연결합니다. 기본 프리셋은 AI/Agents/Vectorize/확장 예제를 끕니다. `--preset full`은 AI·Agents·확장 예제와 바인딩을 함께 켭니다. Vectorize와 R2는 별도 설정이 필요합니다.

저장소를 직접 복제해 개발한다면 `.dev.vars.example`을 `.dev.vars`로 복사하고, 관리자 이메일/비밀번호를 바꾼 뒤 마이그레이션과 `admin:bootstrap`을 실행하세요. localhost에서도 기본적으로 로그인합니다. 비밀번호 로그인은 설정한 1개 운영자 계정용입니다. 여러 관리자는 등록된 계정으로 GitHub 또는 Access를 사용합니다.

## 프로젝트별 설정

`worker/wrangler.jsonc`는 JSON 호환 형식입니다. 운영용 최상위 설정과 `env.staging`의 리소스 ID를 각각 채웁니다. D1과 KV는 환경마다 새로 만들고, 런타임 시크릿도 각각 입력합니다. 예:

```sh
cd worker
pnpm exec wrangler d1 create my-service
pnpm exec wrangler d1 create my-service-staging
pnpm exec wrangler kv namespace create APP_KV
pnpm exec wrangler kv namespace create APP_KV --env staging
pnpm exec wrangler secret put ADMIN_LOGIN_PASSWORD
pnpm exec wrangler secret put ADMIN_LOGIN_PASSWORD --env staging
```

출력된 ID를 대응하는 환경에 넣고 루트에서 `pnpm config:check` 또는 `pnpm config:check --env staging`으로 검사합니다. `CLOUDFLARE_ACCOUNT_ID` 및 `AI_GATEWAY_ACCOUNT_ID` 플레이스홀더도 자신의 계정 ID로 교체하세요. 운영 마이그레이션 후 `pnpm admin:bootstrap --email owner@example.com --remote`를 실행합니다. 스테이징은 `--env staging`을 추가합니다. 이미 활성 최고 관리자가 있으면 추가 최고 관리자를 만들지 않습니다.

## 카카오 일반 회원

1. 카카오디벨로퍼스에서 **해당 프로젝트 전용 앱**을 준비하고 카카오 로그인을 활성화합니다.
2. 사이트와 같은 origin의 Redirect URI를 등록합니다. 예: `https://example.com/api/members/kakao/callback`.
3. `ENABLE_KAKAO=true`, `KAKAO_REDIRECT_URI`를 설정하고 `KAKAO_REST_API_KEY` 및 (앱에서 활성화했다면) `KAKAO_CLIENT_SECRET`을 Worker secret으로 입력합니다. staging은 별도로 설정합니다.
4. 로컬 예시는 `http://localhost:5173/api/members/kakao/callback`입니다. 카카오에도 정확히 같은 주소를 등록합니다.
5. `/account`에서 로그인합니다. 개인정보 동의가 없어도 카카오 회원번호로 가입합니다. 이메일은 제공되고 검증된 경우만 보관하며 이메일로 다른 계정을 자동 연결하지 않습니다.

OAuth state는 브라우저 쿠키와 일회용 DB 레코드를 함께 검증합니다. 카카오 access token은 로그인 중에만 사용하고 저장하지 않습니다. 회원 쿠키와 관리자 쿠키는 별개입니다. 회원 가입은 관리자 권한을 부여하지 않습니다. 로그아웃은 해당 사이트 세션을 폐기하며 카카오 계정 전체 로그아웃/연결 해제는 하지 않습니다.

공식 규격: https://developers.kakao.com/docs/ko/kakaologin/rest-api

## 그로블 결제

1. 그로블에서 상품/결제창을 만들고 승인된 결제 링크를 준비합니다. MCP를 사용한다면 상품 초안·판매 설정을 돕는 운영 도구로 사용합니다. **런타임 결제 서버가 MCP에 의존하지 않습니다.**
2. `ENABLE_GROBLE=true`와 `ENABLE_KAKAO=true`를 설정합니다.
3. 그로블에 `https://example.com/api/webhooks/groble`을 등록하고 8개 결제/구독 이벤트를 선택합니다. 발급된 키는 `GROBLE_WEBHOOK_SECRET`으로 설정합니다.
4. 관리자 콘솔의 **결제 · 상품**에서 사이트 상품 ID, 그로블 상품 ID, 결제 링크, 실제 결제 금액, 단건/정기를 등록합니다. 가격·통화·상품·결제 유형이 일치해야 자동 이용 권한이 생깁니다.
5. 그로블 결제 후 이동 페이지를 `https://example.com/account`로 설정합니다. 이 페이지 방문 자체로 결제를 확정하지 않습니다.
6. 회원 로그인 → 구매 → 실제 결제 → 구매 내역 반영 → 환불을 staging에서 확인한 뒤 운영합니다.

공식 문서:
- https://www.groble.im/help/guides/payment-module
- https://www.groble.im/help/guides/webhook
- https://www.groble.im/help/guides/webhook-events

서명은 raw bytes로 검증합니다. 5분 시각 범위와 중복 이벤트 키를 확인하고, 키 교체 중에는 `GROBLE_WEBHOOK_SECRET_PREVIOUS`도 지원합니다. 교체 완료 후 이전 키를 제거하세요. 웹훅은 회원의 임의 추측이 어려운 주문 참조값과 연결됩니다. 환불이 먼저 오더라도 원 결제 식별자로 나중에 연결됩니다. 원본 개인정보/카드 payload는 저장하지 않습니다.

### 기본 권한 정책과 확장 지점

- 단건: 정확한 결제 확인 후 접근 허용, 전액 환불 후 회수. 취소 요청만으로는 회수하지 않습니다.
- 부분 환불: 상태를 표시하고 접근을 보류합니다. 상품별 환불·이용 정책은 `worker/src/biz/pay/service.ts`의 `summarizeOrder`에서 구현하세요.
- 정기: 확인된 결제 회차의 다음 청구일(KST 자정)까지 허용합니다. 갱신 실패/종료는 회수하고, 해지 요청은 남은 이용기간을 존중합니다. 회차 환불을 구독 종료로 간주하지 않습니다. 날짜만 제공되는 공급자 규격 때문에 시간 단위 유예가 필요하면 별도로 정의하세요.
- 기본 예제는 고정 금액입니다. 쿠폰·할인·수량으로 결제액이 달라지면 자동 승인하지 않고 `review_required`로 표시합니다. 복합 가격 정책은 서버에서 검증하는 별도 가격 규칙으로 확장하세요.
- `/api/payments/orders`는 자기 주문만 반환합니다. `hasAccess`는 서버가 계산한 결과입니다. 유료 파일/강의 API를 만들 때 `memberOrders` 또는 동일한 서버 정책으로 권한을 재확인해야 합니다. 이 템플릿은 실제 전자책 파일 전달 시스템을 포함하지 않습니다.
- 이벤트는 변경 불가능한 사실로 저장하고 조회 시 상태를 계산합니다. 중복·역순 처리에 안전하며, 대규모 서비스에서는 동일 정책을 D1 projection/Queue로 확장할 수 있습니다. 현재 계정 화면은 최신 100개 주문을 표시합니다.
- 그로블 상품 생성·판매/환불 실행은 그로블에서 합니다. 관리자 화면의 상품 저장은 이 사이트의 연결 정보만 바꿉니다.

메타 픽셀/GA4는 그로블 결제창 설정에서 연결할 수 있습니다. 이 기본형은 브라우저의 결제 완료 페이지 방문을 구매 이벤트로 전송하지 않습니다. 도입 시 서버 이벤트와 중복 집계 방지 정책을 정하세요.

## 기존 설치 업그레이드

1. 운영 DB 백업과 staging 검증 후 `0011_identity_commerce.sql`까지 적용합니다. 기존 실제 관리자는 유지되고 샘플 관리자만 제거됩니다.
2. 기존 JWT 세션은 지원하지 않으므로 다시 로그인합니다. `ADMIN_JWT_SECRET`은 더 이상 사용하지 않습니다. 새 세션은 DB에 해시만 저장하며 로그아웃/역할 변경/비활성화 시 폐기합니다.
3. `ADMIN_ACCESS_MODE=off`는 `ENV_NAME=development|test`이고 loopback 접속일 때만 허용합니다. 운영 localhost 예외는 없습니다.
4. Access 사용 시 팀 도메인과 Audience를 새로 설정합니다. 관리자 DB에 실제 사용자가 있어야 합니다.
5. 기존 배포에서 Agents Durable Object를 사용했다면 **기존 바인딩과 migrations 이력을 유지**하세요. 이 저장소의 기본 wrangler 설정은 신규 프로젝트용입니다. 기존 리소스를 삭제/초기화하는 용도로 덮어쓰지 마세요.
6. Cron은 만료 세션·OAuth state·요청 제한 레코드와 30일 초과 API 로그를 정리합니다. 결제 이력은 지우지 않습니다.

## 검증

```sh
pnpm check
pnpm test
pnpm build
pnpm --filter @octoworkers/worker db:migrate:local
```

SQLite 전체 마이그레이션과 실제 인증/인가 테스트, 공급자 응답을 모의한 OAuth/서명 웹훅 테스트, CLI tarball을 저장소 밖에 풀어 생성하는 테스트를 포함합니다. 외부 공급자의 실제 로그인/결제는 프로젝트 키를 설정한 뒤 추가 검증해야 합니다. CI/CD는 production/staging GitHub Environment를 사용하며 배포 동시 실행을 직렬화합니다. 승인 제한은 GitHub 저장소의 Environment 설정에서 선택하세요.

### 의존성 유지보수

Wrangler/Hono/React/Vite/DOMPurify 및 Agents를 함께 갱신했습니다. Agents의 MCP peer 기본값보다 패치된 SDK/client와 AI 보조 라이브러리를 사용하도록 root pnpm overrides를 둡니다. 공급자 SDK를 올릴 때 이 고정값을 확인하고 타입·테스트·Worker dry-run을 함께 실행하세요. 운영 패키지 감사는 `pnpm audit --prod`로 수행합니다.
