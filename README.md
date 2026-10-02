# MADANG Plugins

MADANG 제품의 설치 패키지를 배포하는 공개 저장소입니다. DEV.MADANG과 DOCS.MADANG의 Claude Code, Codex, Cursor 플러그인을 제공합니다.

플러그인을 받는 데 DEV.MADANG 원본 저장소의 GitHub 권한은 필요하지 않습니다. DEV.MADANG 설치 이름은 `dev@madang`입니다. 서비스 연결은 별도 OAuth 로그인으로 인증하며, 현재 DEV.MADANG은 회사 Entra 계정과 프로젝트 권한이 있어야 사용할 수 있습니다.

제품별 이름을 같은 `madang` 마켓플레이스에서 관리합니다. DEV.MADANG은 `dev@madang`, DOCS.MADANG은 `docs@madang`으로 독립 설치합니다.

DOCS.MADANG 연결에는 조직 콘솔의 **설정 > 플러그인.MCP 설정**에서 복사한 MCP 주소를 지정합니다. 주소가 없으면 임의의 조직에 연결하지 않습니다. 공개 패키지는 조직 주소·계정·토큰을 포함하지 않습니다. Node.js 20 이상과 npm/npx가 필요하며 브릿지는 고정 버전 `mcp-remote@0.14.3`를 사용합니다.

```bash
export DOCS_MADANG_MCP_URL="https://조직주소/mcp"
```

PowerShell: `$env:DOCS_MADANG_MCP_URL="https://조직주소/mcp"`. 변수는 클라이언트를 시작하는 셸에서 지정합니다.

## 설치

### Claude Code

```bash
claude plugin marketplace add https://github.com/ibank-ax/madang-plugins
claude plugin install dev@madang
# DOCS.MADANG을 사용할 때
claude plugin install docs@madang
claude
```

스킬은 `/dev:start`, `/dev:go`, `/dev:fix`, `/dev:next`, `/dev:runbook`으로 호출합니다. 처음 MCP를 사용할 때 DEV.MADANG 로그인과 권한 동의를 완료합니다.

DOCS 스킬은 `/docs:setup`, `/docs:knowledge`입니다. 첫 연결 때 브라우저에서 지정한 조직으로 로그인하고 MCP 권한에 동의합니다.

Claude Desktop에서 마켓플레이스 주소를 입력할 때도 위 HTTPS 주소를 사용합니다. Claude Code 콘솔에서는 `/plugin marketplace add https://github.com/ibank-ax/madang-plugins`를 입력할 수 있습니다.

### Codex

```bash
codex plugin marketplace add https://github.com/ibank-ax/madang-plugins
codex plugin add dev@madang
# DOCS.MADANG을 사용할 때
codex plugin add docs@madang
codex
```

설치 후 새 대화에서 `$dev-start`, `$dev-go`, `$dev-fix`, `$dev-next`, `$dev-runbook`을 사용할 수 있습니다.

DOCS 스킬은 `$docs-setup`, `$docs-knowledge`입니다. DOCS OAuth 인증은 stdio 브릿지가 연 브라우저에서 진행합니다.

### Cursor

Teams/Enterprise의 Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace → Import from Repo에 아래 주소를 등록하고 Customize에서 `dev` 또는 `docs`를 설치합니다. 팀 정책·요금제에 따라 저장소 가져오기 메뉴가 제한될 수 있습니다.

```text
https://github.com/ibank-ax/madang-plugins
```

스킬은 `/dev-start`, `/dev-go`, `/dev-fix`, `/dev-next`, `/dev-runbook`으로 호출합니다.

DOCS 스킬은 `/docs-setup`, `/docs-knowledge`입니다. 조직 주소를 지정한 셸에서 `cursor .`로 실행합니다. 이미 실행 중이면 완전히 종료하고 다시 시작합니다. 저장소 가져오기를 사용할 수 없거나 GUI가 셸 환경을 받지 못하면 조직의 설정에서 조직 맞춤 ZIP 또는 OAuth 커넥터 방식을 이용합니다.

## 기존 설치를 옮길 때

기존 `ibank-ax/dev.madang.ai` 출처를 공개 배포 저장소로 바꾼 뒤 `dev@madang`을 설치합니다. 같은 마켓플레이스에 다른 플러그인이 설치되어 있을 수 있으므로 `madang` 마켓플레이스 전체를 제거하지 않습니다. 마켓플레이스 이름은 `madang`, 제품 플러그인 이름은 `dev`입니다. Claude Code 호출은 `/dev:*`, Codex는 `$dev-*`, Cursor는 `/dev-*`로 바뀝니다. MCP 서버 이름 `madang`과 서비스 주소는 유지됩니다.

Claude Code:

```bash
claude plugin marketplace add https://github.com/ibank-ax/madang-plugins
claude plugin install dev@madang
```

Codex에서는 플러그인 설정의 `madang` 출처를 공개 주소로 갱신한 뒤 등록합니다.

```bash
codex plugin marketplace add https://github.com/ibank-ax/madang-plugins
codex plugin add dev@madang
```

Cursor에서는 팀 마켓플레이스의 기존 저장소 출처를 공개 주소로 갱신하고 `dev`를 설치합니다. 출처 수정 메뉴가 없으면 팀 관리자에게 요청합니다. 설치 후 새 대화에서 스킬이 보이고 MCP 연결이 가능한지 확인합니다. 서비스 권한을 새로 동의해야 하는 경우에는 MCP에 다시 로그인합니다. 이전 `madang@madang` 플러그인은 새 `dev@madang`의 작동을 확인한 뒤 해당 플러그인만 제거합니다.

### Claude에서 같은 이름의 마켓플레이스 등록이 실패할 때

이전 저장소가 `madang` 이름으로 선언되어 있으면 Claude Desktop이 새 저장소 등록을 거부할 수 있습니다. 마켓플레이스를 제거하면 함께 설치된 플러그인까지 삭제될 수 있으므로 출처만 수정합니다.

계속 실패하고 로그에 `network source differs`가 있다면 설정에 남아 있는 출처 선언을 확인합니다. 사용하는 프로필의 `settings.json`을 백업한 뒤 `extraKnownMarketplaces.madang.source`만 다음 공개 Git 출처로 맞춥니다. Claude Code의 기본 사용자 설정 위치는 `~/.claude/settings.json`이며 프로필이나 관리 정책에 따라 다를 수 있습니다.

```json
{
  "source": "git",
  "url": "https://github.com/ibank-ax/madang-plugins"
}
```

기존 `source: "github"`·`repo: "ibank-ax/dev.madang.ai"` 선언을 위 객체로 교체하며 설정 파일 전체를 덮어쓰지 않습니다. 조직 관리 정책에서 선언한 출처이면 관리자에게 변경을 요청합니다. 설정을 저장하고 Claude를 완전히 종료한 뒤 다시 등록합니다.

## 배포와 유지보수

이 저장소의 플러그인은 각 제품의 원천에서 생성한 배포물입니다. 패키지를 손으로 수정하지 않습니다. 변경과 제품 추가 절차는 [CONTRIBUTING.md](CONTRIBUTING.md)를 따릅니다. 다른 MADANG 제품은 조직 승인을 받은 뒤 추가합니다.
