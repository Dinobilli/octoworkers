# 그로블 결제 · MCP 연결 가이드

이 문서는 Octoworkers의 `--groble` 선택 모듈을 프로젝트에 연결하는 실무 안내입니다. 공식 문서 전체를 복제하지 않고, 출처와 이 저장소의 설정·코드 연결점을 함께 관리합니다. 공식 문서 확인일: **2026-10-11**. 공급자의 메뉴·규격이 바뀌면 아래 원문을 다시 확인하세요.

## 공식 문서

| 문서 | 확인할 내용 |
| --- | --- |
| [결제창 연동](https://www.groble.im/help/guides/payment-module) | 결제 링크, 진입·이동 페이지, 주문 참조값 `ref` |
| [MCP 연결](https://www.groble.im/help/guides/mcp) | 지원 클라이언트, OAuth 연결, 상품 준비·운영 |
| [웹훅 연결](https://www.groble.im/help/guides/webhook) | 수신 URL, 서명, 재전송·중복 처리 |
| [웹훅 이벤트](https://www.groble.im/help/guides/webhook-events) | 결제·환불·구독 이벤트의 최신 payload |

## MCP와 사이트 결제의 역할

MCP는 운영자가 AI 도구에서 그로블 계정에 연결해 상품을 준비하고 운영하는 선택 도구입니다. 사이트 구매자는 MCP에 연결하지 않습니다.

```text
운영자 → AI 도구 → Groble MCP → 상품 준비·운영
구매자 → /account → Octoworkers checkout → 그로블 결제창
그로블 → 서명 웹훅 → Worker 검증·D1 기록 → 구매 내역·이용 권한
```

MCP 없이 그로블 웹에서 상품을 준비해도 이 보일러플레이트의 결제 기능을 사용할 수 있습니다. MCP 연결만으로 Worker의 상품 매핑이나 웹훅 secret이 자동 설정되지는 않습니다.

## MCP 연결 준비

공식 [MCP 가이드](https://www.groble.im/help/guides/mcp)의 사용하는 앱 또는 CLI 절차를 따릅니다. 클라이언트마다 설정 형식이 다르므로 아래 값은 공통 연결 정보입니다.

| 항목 | 값 |
| --- | --- |
| 서버 이름 예시 | `groble` |
| 원격 MCP URL | `https://mcp.groble.im/mcp` |
| 인증 | OAuth; 브라우저에서 판매자 계정 로그인과 권한 허용 완료 |

연결 후 AI에 “그로블에서 내 연결 상태와 판매 준비 상태를 조회해줘”라고 요청하고, 실제 도구 조회 결과를 확인합니다. 서버 등록 목록에 이름이 보이는 것만으로 인증·판매 준비가 완료된 것은 아닙니다. 현재 제공되는 도구와 계정 조건은 공식 가이드와 연결된 도구 목록을 기준으로 판단하세요.

상품 준비를 요청할 때 사용할 예시:

> 내 판매 준비 상태와 기존 상품을 조회해줘. 이 프로젝트용 전자책 결제창을 준비하려고 해. 상품명·가격·제공 자료·진입 페이지·결제 후 이동 페이지를 정리하고, 부족한 입력을 알려줘. 상품을 만들면 실제 상품 ID와 결제 URL을 알려줘. 판매 시작은 초안을 검토한 다음 진행할게.

MCP OAuth 토큰은 사용하는 클라이언트에서 관리합니다. Worker에 넣는 `GROBLE_WEBHOOK_SECRET`과는 다른 인증 정보이며, 어느 것도 저장소에 커밋하지 않습니다.

## Octoworkers에 연결하기

먼저 [새 프로젝트/업그레이드 가이드](05-boilerplate-upgrade.md)의 Cloudflare 리소스, 마이그레이션, 관리자 생성, 카카오 설정을 마칩니다. 아래는 이 저장소 구현에 맞춘 순서입니다.

1. 그로블에서 사용할 상품 ID와 HTTPS 결제창 링크를 확보합니다. 현재 코드는 `https://groble.im/payment/<상품주소>` 또는 `www.groble.im`의 같은 경로만 허용합니다.
2. 해당 환경의 `worker/wrangler.jsonc` vars에 `ENABLE_GROBLE`과 `ENABLE_KAKAO`를 문자열 `"true"`로 설정합니다. 기본 구매 예제는 사이트 회원 로그인을 요구합니다.
3. 그로블에 배포한 Worker의 `https://<사이트호스트>/api/webhooks/groble` 주소를 등록합니다. 아래 8개 이벤트를 수신하도록 설정합니다.
4. 발급된 웹훅 서명 키를 해당 환경의 Worker secret에 저장합니다. 로컬 개발은 무시되는 `worker/.dev.vars`를 사용합니다.
5. 관리자 콘솔의 **결제 · 상품**에 사이트 상품 ID, 그로블 상품 ID, 결제 링크, 금액, 단건/정기 유형을 등록합니다. 이 작업은 로컬 연결 정보를 저장하며 그로블 상품 자체를 생성하지 않습니다.
6. 결제 후 이동 페이지를 `https://<사이트호스트>/account`로 설정합니다. 구매 버튼은 `/api/payments/checkout`이 반환한 `checkoutUrl`로 이동해야 회원 주문과 연결됩니다.

```sh
# worker 디렉터리에서 실행. 값은 명령행 인자 대신 프롬프트로 입력합니다.
pnpm exec wrangler secret put GROBLE_WEBHOOK_SECRET --env staging
# 운영 환경은 별도로 설정합니다.
pnpm exec wrangler secret put GROBLE_WEBHOOK_SECRET
```

운영과 staging의 수신 주소·키·상품 매핑이 서로 맞는지 확인하세요. 키 교체 기간에는 `GROBLE_WEBHOOK_SECRET_PREVIOUS`를 함께 둘 수 있으며, 교체 후 제거합니다.

지원 이벤트:

```text
payment.completed
payment.cancel_requested
payment.refunded
subscription_payment.completed
subscription_payment.refunded
subscription_payment.failed
subscription.cancel_requested
subscription.terminated
```

## 코드와 검증 지점

| 저장소 파일 | 역할 |
| --- | --- |
| [pay/routes.ts](../worker/src/biz/pay/routes.ts) | 상품 매핑, checkout, 자기 주문 조회, 웹훅 수신 |
| [pay/service.ts](../worker/src/biz/pay/service.ts) | 서명 검증, 이벤트 기록, 주문 상태·접근 권한 계산 |
| [identity-commerce.test.ts](../worker/test/identity-commerce.test.ts) | 인증 경계, 중복·역순 웹훅, 환불·구독 검증 |
| [업그레이드 가이드의 권한 정책](05-boilerplate-upgrade.md#기본-권한-정책과-확장-지점) | 할인·부분 환불·유료 콘텐츠 확장 시 결정할 정책 |

서버는 임의 주문 참조값을 생성해 결제 URL에 넣고, 검증된 웹훅을 통해 저장된 주문과 연결합니다. 결제 후 돌아온 URL이나 브라우저 메시지만으로 이용 권한을 부여하지 않습니다. 전자책 다운로드·강의 API는 서버에서 구매 권한을 확인하도록 별도로 구현해야 합니다.

프로젝트 키를 설정한 뒤 확인할 항목:

- 회원 로그인 후 구매 시 `ref`가 포함된 checkout URL이 생성되는지 확인합니다.
- 실제 결제 이벤트가 회원의 주문과 연결되고 상품·금액·통화·유형이 일치하는지 확인합니다.
- 구매 내역 및 환불 후 권한 변화를 확인합니다. 정기 상품은 갱신 실패·해지·종료도 확인합니다.
- 자동 테스트는 공급자 응답을 모의합니다. 실제 결제·환불 검증은 별도로 진행하며 실제 금액이 발생할 수 있습니다.

문제 확인:

| 증상 | 먼저 확인할 곳 |
| --- | --- |
| 모듈 API가 404 | 배포 환경의 기능 플래그 |
| checkout이 503 | 결제 링크 형식, 웹훅 secret 설정 |
| 웹훅이 401 | 해당 환경의 서명 키, 원본 본문 보존, 요청 시각 |
| 주문이 `pending` | 수신 로그, 웹훅 `sellerReference`, checkout 경유 여부 |
| 주문이 `review_required` | 상품 ID·금액·통화·유형, 할인 및 부분 환불 정책 |
| MCP에 도구가 안 보임 | OAuth 권한 허용, 클라이언트의 연결 활성화·도구 목록 갱신 |

## 문서 유지보수

공급자 규격 변경 시 공식 링크와 확인일을 갱신하고 `routes.ts`, `service.ts`, 서명·이벤트 테스트를 함께 검토합니다. MCP의 상품 운영 기능과 Worker의 결제 처리 기능은 별도로 검증합니다. 실제 계정 정보, 주문 개인정보, OAuth 토큰, 서명 키는 문서 예시에 넣지 않습니다.
