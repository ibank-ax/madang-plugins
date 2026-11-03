# ACA.MADANG — 조직별 native HTTP MCP 패키지

공개 `aca` 패키지는 설정·읽기 스킬과 조직별 패키지 생성 원천을 제공합니다. **현재 공개 입구는 `tenant_variant_pending`이며 MCP 주소가 설정되어 있지 않습니다.** 승인된 조직 Host를 입력하기 전에는 endpoint를 생성하지 않습니다. 공용 `aca.madang.ai/mcp`, 조직 찾기·공용 OAuth gateway, 환경변수·stdio bridge·수동 token 대체 경로는 제공하지 않습니다.

## 공개 설치와 조직별 설정

공통 `madang` 마켓플레이스의 `aca`를 설치한 것만으로 연결되지는 않습니다. 공개 bootstrap에는 MCP 설정 파일/서버가 없으며 `aca-setup`·`aca-read` 스킬만 있습니다. 조직 관리자가 알려 준 **승인된 조직 주소**의 `/mcp`가 필요합니다. Host의 모양이 맞는 것과 실제 조직 등록/운영 준비는 별도입니다. 다른 제품이나 전체 마켓플레이스를 제거하지 않습니다.

Node.js 22와 Git이 있는 준비 환경에서 공개 저장소만 받아 고정 공개 커밋의 allowlist 원천으로 생성합니다. private ACA 저장소 권한·제품 서버 코드·키는 필요하지 않습니다.

```sh
git clone https://github.com/ibank-ax/madang-plugins.git
cd madang-plugins
git rev-parse HEAD
node plugins/aca/export.mjs --commit <위에서-확인한-40자리-공개-커밋> --host <승인된-조직-hostname> --out <Git-checkout-밖의-새-절대-출력경로>
```

`--host`는 관리자가 승인한 `<조직>.aca.madang.ai` Host만 받습니다. URL 전체·포트·IP·다른 제품·공용/예약 Host는 거절하며 기본값은 없습니다. exporter는 실제 Host 등록을 조회하거나 네트워크에 접속하지 않습니다. 실제 등록·허브 변형·운영 활성은 운영 담당자가 별도로 확인합니다. 기존 출력·설정·Git checkout은 덮어쓰지 않고 새 경로에만 일반 파일로 만듭니다. CLI는 실패 때 고정 코드만 출력합니다.

기본 출력은 정확 **17파일**입니다: 세 IDE별 매니페스트·native HTTP MCP 설정·README·스킬2개와 `SOURCE.json`·`EXPORT-RECEIPT.json`입니다. SOURCE의 `sourceCommit`은 ACA 원 제공자, `packageCommit`은 공개 exporter/template 판본을 가리킵니다. 수신증은 파일 해시를 제공하며 설치·OAuth·실읽기·Host 등록 검증을 성공으로 표시하지 않습니다. 조직별 생성물을 공용 저장소에 올리지 않습니다.

### 실제 설치 경로

조직별 로컬 마켓플레이스가 필요하면 같은 명령에 `--marketplace`를 덧붙입니다. 기본17파일을 유지하고 세 IDE의 카탈로그3개만 추가한 **20파일**의 별도 새 출력이 됩니다. 이름은 `madang-aca-organization`이며 다른 제품 항목이나 기존 IDE 설정을 수정하지 않습니다.

- **Claude Code:** `claude --plugin-dir <출력경로>/claude`로 조직 variant를 명시적으로 로드하거나, `claude plugin marketplace add <20파일-출력경로>` 후 `claude plugin install aca@madang-aca-organization`을 사용합니다. 새 세션에서 실제 `aca` HTTP 주소를 확인합니다. [공식 플러그인 안내](https://code.claude.com/docs/en/plugins).
- **Codex:** `codex plugin marketplace add <20파일-출력경로>`로 로컬 마켓플레이스를 등록하고 앱 Plugins Directory에서 `madang-aca-organization`의 `aca`를 설치합니다. 새 대화를 열어 실제 조직 HTTP 설정과 설정/읽기 스킬을 확인합니다. 개인 config나 cache를 직접 덮어쓰지 않습니다. [OpenAI 공식 로컬 마켓플레이스 안내](https://developers.openai.com/plugins/build/plugins).
- **Cursor:** Customize의 Import from Disk가 허용된 경우 `<출력경로>/cursor`를 가져오거나, 해당 폴더의 일반 파일을 새 `~/.cursor/plugins/local/aca`에 복사한 뒤 Reload Window하고 Customize에서 MCP/스킬을 확인합니다. Enterprise는 관리자의 Allow Local Plugin Imports 정책을 따릅니다. 같은 이름의 공개 marketplace 설치가 있으면 local보다 우선하므로 조직 variant를 쓰기 전에 **ACA 공개 bootstrap만** 비활성/제거합니다. 다른 제품·전체 marketplace·설정을 지우지 않습니다. [공식 local plugin 안내](https://cursor.com/docs/plugins).

등록/설치·디스크 파일·실행 세션의 설정은 따로 확인합니다. 설치 메뉴/관리 정책이 해당 경로를 지원하지 않으면 미수용으로 남기고 관리자에게 정상 배포 경로를 요청합니다. 클라이언트나 관리 정책을 우회하지 않습니다. 위는 설치 경로이며 실제 세 IDE 설치 성공의 수신증은 아닙니다.

## 로그인·허용·읽기·해제

ACA 자체 계정으로 로그인한 뒤 요청 앱·돌아갈 주소·`aca:read`를 확인하고 **연결 허용**을 직접 선택합니다. 설치·로그인·약관 고지는 이 동의를 대신하지 않습니다. bearer·Campaign 원자격·허브 assertion·client secret을 입력/복사하지 않습니다.

읽기는 현재 native 권한·membership·조직 계약·최신 고지·외부 에이전트 설정을 재확인한 `goals_summary_get` 하나이며 빈 arguments를 사용합니다. 허용된 목표 상태별 집계만 다루고 고객 행·목표 제목·구성원·그룹 이름·실행/발송/예약/승인/편집을 요구하지 않습니다. `not_ready`·`forbidden`·`invalid_token`·null은 그대로 설명하며 0·빈 목록·가짜 성공으로 바꾸지 않습니다.

같은 조직 주소의 `/mcp/connections`에서 본인 연결(n/5)·scope·만료·해제 이력을 확인합니다. 검증된 같은 계정의 연결은 조직 전체 합산이며, 새 연결을 승인할 때 보이는 최초 연결 회수 예고를 확인합니다. 실제 회수/생성은 code 교환 시 한 거래로 처리합니다. 플러그인 제거·웹 로그아웃은 서버 grant 회수를 대신하지 않습니다. 교환 결과 불명은 자동 재송신/새 code 발급으로 덮지 말고 연결 상태를 대조하고 명시적으로 재연결합니다. token/code/cookie/전체 인증 URL을 보고서·로그에 남기지 않습니다.

## 출처와 검수 경계

원 제공자 `ibank-ax/aca.madang.ai@ccb0774b90eba58c94a7f752d2d3d92fb322c8a8`, 원 template/허용목록 해시는 `provenance.json`에 고정합니다. 정규15 후속 source는 `1b48db6414aa849af59d5278d5ba895c3b613ec7`, 현재 관측한 native 소비자 source는 `8fb69cd2be439425dc57878a2d04346408af3611`입니다. 제공자 source·정규15의 별도 PG 수신·native protocol CI·공개 패키지 검증은 서로 다른 근거입니다.

공개 패키지는 운영을 켜지 않습니다. 실제 등록 조직 Host의 variant 생성·3IDE 설치/표시·SSO/OAuth 허용·실제 집계 읽기·권한 밖 거절·회수 뒤 동일 token 거절은 **별도 미완료**입니다. 공개 fixture/CI·bootstrap만으로 목표9 완료·실사용 수용을 선언하지 않습니다. AI 계열 자동발견은 `unavailable`이고 `ACA-EX-07` 조직별 입구를 유지합니다.
