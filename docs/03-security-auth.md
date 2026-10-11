# 인증과 권한

## 관리자

`ADMIN_ACCESS_MODE`는 `session`(기본), `cloudflare-access`, `hybrid`를 지원합니다. 모든 방식은 활성 `admin_users` 계정과 연결되어야 합니다. DB에 등록되지 않은 계정은 허용하지 않습니다.

- 비밀번호 로그인: `ADMIN_LOGIN_EMAIL`, secret `ADMIN_LOGIN_PASSWORD`를 사용합니다. 첫 관리자 생성은 `pnpm admin:bootstrap --email ...`로 명시적으로 수행합니다.
- GitHub 로그인: client ID/secret 및 `GITHUB_ALLOWED_USERS`를 설정합니다. 공급자에서 검증된 기본 이메일이 관리자 DB와 일치해야 합니다. 비어 있는 허용 목록은 아무도 허용하지 않습니다.
- Access: `CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com`, `CF_ACCESS_AUD`를 설정합니다. `Cf-Access-Jwt-Assertion`의 서명·issuer·audience·만료를 검증합니다. 이메일 헤더만 보내는 요청은 인정하지 않습니다.
- `ADMIN_ALLOWED_EMAILS`는 선택적인 추가 제한입니다. 빈 값은 DB 역할을 기준으로 판단하며, 값을 넣으면 초대한 관리자도 해당 목록에 있어야 합니다.

`super_admin > admin > editor > viewer` 순서입니다. 일반 admin은 최고 관리자/다른 admin 계정을 생성·변경하지 못합니다. 마지막 활성 최고 관리자의 삭제·비활성화·강등은 DB 트리거로 차단합니다. 자신의 계정 삭제/비활성화도 API에서 차단합니다. Agents 연결도 같은 활성 계정 검사와 editor 이상의 역할을 요구합니다.

## 세션과 개발 모드

DB에는 임의 세션 토큰의 SHA-256 해시만 저장합니다. 관리자 12시간, 회원 7일 후 만료합니다. 쿠키는 httpOnly, SameSite=Lax, HTTPS에서 Secure 및 __Host prefix를 사용합니다. OAuth 콜백에 필요한 Lax 정책과 함께 변경 API에는 Origin/Sec-Fetch-Site 검사를 적용합니다. 클라이언트는 각 사이트와 같은 origin의 API를 호출합니다.

로그아웃은 서버 세션을 폐기합니다. 관리자 역할/활성화 변경·삭제 시 세션도 폐기됩니다. `ADMIN_ACCESS_MODE=off`는 명시적인 development/test 환경의 localhost/127.0.0.1에서만 동작합니다. 운영에서는 off나 로컬 호스트 이름만으로 접근을 우회할 수 없습니다.

## 일반 회원과 결제

카카오 회원은 `members` 테이블과 별도 쿠키를 사용합니다. 이메일 자동 계정 연결, 자동 관리자 승격은 없습니다. 결제 상태는 서명 검증된 그로블 웹훅으로만 판단합니다. 설정과 API는 [프로젝트 가이드](05-boilerplate-upgrade.md)를 참고하세요.

요청 제한은 D1의 원자적 카운터를 사용합니다. 저장소 오류 시 보호 대상 요청을 통과시키지 않습니다. 보안 헤더와 인증 API no-store를 적용하고, 외부 서비스 시크릿은 Worker secrets 및 로컬 ignored `.dev.vars`로 관리합니다.
