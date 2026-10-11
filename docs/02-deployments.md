# 개발 / 스테이징 / 운영 배포

Node.js 22.18 LTS 또는 24.11 이상 및 pnpm 9.15.0을 사용합니다. 신규 프로젝트는 [설정 가이드](05-boilerplate-upgrade.md)를 먼저 따릅니다.

- `worker/wrangler.jsonc` 최상위: production
- `env.staging`: 별도 이름, D1, KV, 변수 및 Cron
- 런타임 시크릿은 환경별로 따로 설정합니다. staging은 wrangler 명령에 `--env staging`을 붙입니다.
- AI/Agents 등 선택 바인딩도 환경별로 선언합니다. 기존 Durable Object migration 이력을 삭제하지 않습니다.

```sh
pnpm config:check --env staging
pnpm deploy:staging
pnpm deploy:prod
```

배포 스크립트는 설정 검사 → 프론트 빌드 → 대상 DB 마이그레이션 → Worker 배포 순서로 실행합니다. 미설정 플레이스홀더, off 인증, 공유 D1/KV를 발견하면 중단합니다. 실제 secret 존재 여부는 이 검사만으로 확인할 수 없으므로 별도 설정해야 합니다.

GitHub Actions:
- PR/main: 타입, 실제 SQLite 통합 테스트, CLI 패키지 테스트, 로컬 D1 마이그레이션 및 빌드
- develop: staging Environment로 배포
- main: production Environment로 배포
- 배포별 concurrency group으로 겹치는 배포를 방지합니다.

각 GitHub Environment에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 설정합니다. 보호 브랜치/승인 규칙은 저장소 설정에서 정합니다. 카카오·그로블·관리자 비밀번호는 GitHub 토큰과 별개인 Worker runtime secrets입니다.

도메인 미정이면 workers.dev 임시 주소를 `APP_DOMAIN`과 OAuth Redirect URI에 사용하고, `/admin/`으로 콘솔에 접근할 수 있습니다. 커스텀 도메인이 생기면 `routes: [{pattern: "example.com", custom_domain: true}]`를 원하는 환경에 추가하고 공급자 Redirect URI도 바꿉니다. OAuth 시작과 콜백은 같은 origin이어야 합니다.

빌드 결과는 `worker/public/landing` 및 `worker/public/admin`입니다. `pnpm dev`는 5173/5174의 Vite 화면과 8787의 Worker를 실행합니다. 그로블 웹훅은 외부 HTTPS 주소가 필요하므로 실제 결제 검증은 staging에서 수행합니다.

기존 서비스 업그레이드는 백업 → staging 마이그레이션/검증 → 운영 마이그레이션 → 코드 배포 순서로 진행합니다. 새 테이블/트리거를 포함한 DB 변경은 Worker 코드 롤백만으로 되돌아가지 않습니다.
