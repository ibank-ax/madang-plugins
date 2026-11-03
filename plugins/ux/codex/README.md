# UX.MADANG — ux@madang 0.1.0

프로젝트·저장된 리포트·프로젝트 어휘를 읽는 스킬과 **native HTTP MCP·OAuth** 연결을 제공합니다. 공용 MCP 주소는 `https://ux.madang.ai/mcp`, 읽기 scope는 `ux:read`입니다. 설치는 제품 자료에 대한 접근 권한이 아닙니다. 현재 공개 버전의 존재·설치·로그인·호출 결과는 각각 확인해야 합니다.

## 설치와 연결

공유 마켓플레이스 `madang`에 `ux`가 게시된 뒤 아래 경로를 사용합니다. 다른 제품의 플러그인을 제거하거나 전체 설정을 초기화하지 않습니다.

### Claude Code

```bash
claude plugin marketplace add https://github.com/ibank-ax/madang-plugins
claude plugin install ux@madang
```

새 세션의 `/mcp`에서 서버 `ux`의 Authenticate를 시작합니다. `/ux:setup`, `/ux:read` 스킬을 사용합니다. 설정 source 충돌은 실제 오류와 기존 `madang` 출처를 먼저 확인하고 해당 선언만 canonical HTTPS Git URL로 맞춥니다. 관리형 설정은 관리자에게 요청합니다. 설정·디스크 캐시·실행 세션 갱신은 다르며 지원되는 세션의 `/reload-plugins` 또는 앱 재시작 후 실제 HTTP 설정을 확인합니다.

### Codex

```bash
codex plugin marketplace add https://github.com/ibank-ax/madang-plugins
```

앱의 Plugins Directory에서 `madang`의 `ux`를 선택해 설치하고 새 채팅의 MCP 연결에서 OAuth 로그인을 시작합니다. `$ux-setup`, `$ux-read`를 사용합니다. 이 패키지는 기존 공개 DEV/DOCS와 같은 `.codex-plugin/plugin.json` 호환 형식을 사용합니다. CLI·앱 버전에 따른 실제 설치 가능 여부를 별도 확인합니다. 개인 설정·캐시 파일을 직접 덮어쓰지 않습니다.

### Cursor

지원되는 Teams/Enterprise Dashboard의 Plugins & MCPs → Team Marketplaces → Import from Repo에 같은 HTTPS Git URL을 등록하고 `ux`를 설치합니다. MCP의 `ux`에서 Connect를 시작하고 `/ux-setup`, `/ux-read`를 사용합니다. 메뉴·요금제·표시 제목은 실제 클라이언트에서 확인해야 합니다. native HTTP를 지원하면 그 연결을 사용하며 임의 bridge나 토큰 복사를 설치 조건으로 만들지 않습니다.

## OAuth·권한·해제

1. 클라이언트가 공용 endpoint의 discovery와 동적 등록으로 OAuth를 시작합니다. 별도 수동 키·미리 정한 client ID·토큰 입력은 필요하지 않습니다.
2. 회사 찾기와 메일의 정상 조직 경로에서 로그인합니다. 기존 SSO 로그인도 **연결 허용**의 명시 동의를 대신하지 않습니다. 서버가 표시한 클라이언트와 읽기 scope를 확인하고 허용하거나 취소합니다. 클라이언트 이름은 자기 신고값입니다.
3. 현재 계정에서 읽을 수 있는 프로젝트 UUID를 확보한 뒤 `get_project`로 확인합니다. UUID가 없으면 사용자에게 기존 프로젝트 참조를 요청하며 추측하거나 다른 조직을 탐색하지 않습니다. 결과는 현재 membership·역할·프로젝트 객체권한과 조직 상태를 그대로 따릅니다.
4. 연결 관리 화면은 같은 계정의 모든 조직을 합산한 활성 연결 수(n/5)와 해제 영향을 보여줍니다. 새 6번째 연결이 실제로 성립할 때 최초 연결시각이 가장 이른 연결이 해제됩니다. 같은 client 재승인은 최초 연결시각을 바꾸지 않습니다.
5. 본인 연결 관리에서 연결을 해제하고 서버 결과를 확인합니다. 로컬 패키지 제거는 서버의 OAuth grant 회수를 대신하지 않습니다. 다른 조직으로 바꾸려면 기존 연결을 해제한 뒤 대상 조직에서 다시 로그인·동의합니다. 토큰·웹 cookie를 다른 조직이나 에이전트에 복사하지 않습니다.

서버가 연결 준비 미완료(503)를 반환하면 준비 전 성공·권한 부족으로 바꾸어 표시하지 않습니다. 기능이 비활성이거나 계정의 검증된 연결 준비가 없을 수 있으므로 제품 담당자의 정상 준비를 기다립니다. 플러그인이 기능을 자동으로 켜거나 계정을 대신 연결하지 않습니다.

## 읽기와 오류

- `get_project`: 필수 `project_id`로 허용된 프로젝트를 읽습니다.
- `search_report`: `project_id`, `query`가 필수입니다. `version`은 `current`(기본), `draft`, 양수 판번호이고 `limit`은1~50입니다. 저장된 코퍼스만 검색하며 새 분석·LLM·크레딧 차감은 하지 않습니다.
- `get_project_vocab`: `project_id`가 필수이며 `query`, `limit`(1~50), `cursor`로 읽기 범위를 좁힙니다.

없는 도구·쓰기 scope는 요청하지 않습니다. MCP의 `isError`·오류코드·HTTP 상태를 함께 확인합니다. 401은 로그인/회수 상태를 확인하고, 403/404는 현재 객체 권한 또는 존재 여부를 확인하며 타 계정으로 우회하지 않습니다. 400/invalid_arguments는 입력을 고치고, 429는 표시된 간격 뒤 재개합니다. 503이나 토큰 교환 결과 불명은 자동 재동의·새 code 재전송으로 복구하지 않습니다. 운영자에게 상태만 전달하고 주소의 session·code·token·cookie 원문은 기록하지 않습니다.

HTTP는 지원되지만 로그인 불가 문구가 나오면 실행 세션의 transport·discovery·인가 시작을 각각 확인합니다. 설치 파일만 보고 OAuth 성공/미지원으로 단정하지 않습니다. 이 패키지는 stdio bridge나 개인 토큰 대체 경로를 포함하지 않습니다.

기타 MCP 클라이언트도 같은 `https://ux.madang.ai/mcp`를 Streamable HTTP/OAuth 서버로 등록합니다. 패키지와 직접 연결은 같은 scope·권한 검사를 사용합니다. 설치·실제 OAuth·도구 호출의 통과는 각각 별도의 근거입니다.
