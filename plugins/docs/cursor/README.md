# DOCS.MADANG — docs@madang

스킬과 OAuth MCP 브릿지를 함께 설치합니다. 공개 패키지에는 조직 주소·계정·토큰을 넣지 않습니다. **Node.js 20 이상과 npm/npx**가 필요하며, 첫 연결 때 고정 버전 `mcp-remote@0.14.3`를 받습니다.

1. 조직 콘솔의 **설정 > 플러그인.MCP 설정**에서 MCP 주소를 복사합니다.
2. 아래의 조직 주소를 복사한 실제 주소로 바꾸고 클라이언트를 시작합니다. 주소가 없거나 플랫폼 주소이면 연결을 중단합니다.

```bash
export DOCS_MADANG_MCP_URL="https://조직주소/mcp"
```

PowerShell에서는 `$env:DOCS_MADANG_MCP_URL="https://조직주소/mcp"`를 사용합니다.

## Claude Code

```bash
claude plugin marketplace add https://github.com/ibank-ax/madang-plugins
claude plugin install docs@madang
claude
```

`/docs:setup`, `/docs:knowledge` 스킬이 제공됩니다. 최초 MCP 연결 때 브라우저에서 조직 계정으로 로그인합니다.

Claude 앱과 콘솔에서는 같은 Git URL을 사용합니다. `owner/repo`도 지원하지만 `github`와 `git`은 설정에서 다른 출처로 취급됩니다.
마켓플레이스 추가가 출처 충돌로 실패하면 `~/.claude/settings.json`을 백업하고 `extraKnownMarketplaces.madang.source`가
`{"source":"git","url":"https://github.com/ibank-ax/madang-plugins"}`인지 확인합니다. 예전 DEV 저장소나 조직 ZIP의 선언이
남아 있으면 이 항목의 출처만 맞추고 다시 등록합니다. 관리형 설정은 관리자에게 요청하며 다른 설정은 유지합니다.
마켓플레이스 삭제 명령은 설치된 플러그인도 제거하므로 복구를 위해 먼저 실행하지 않습니다.

## Codex

```bash
codex plugin marketplace add https://github.com/ibank-ax/madang-plugins
codex plugin add docs@madang
codex
```

새 대화에서 `$docs-setup`, `$docs-knowledge`를 사용할 수 있습니다. OAuth 인증은 MCP 브릿지의 브라우저에서 진행합니다. `codex mcp login`은 이 stdio 브릿지의 인증 명령이 아닙니다.

## Cursor

Teams/Enterprise의 Dashboard > Plugins & MCPs > Team Marketplaces > Add Marketplace > Import from Repo에서 `https://github.com/ibank-ax/madang-plugins`를 등록하고 Customize에서 `docs`를 설치합니다. 팀 정책이나 요금제에 따라 이 메뉴가 없을 수 있습니다.

주소를 지정한 셸에서 `cursor .`로 실행합니다. 이미 실행 중이면 완전히 종료하고 다시 시작해야 합니다. `/docs-setup`, `/docs-knowledge`를 사용할 수 있습니다. 저장소 가져오기를 사용할 수 없으면 조직 설정에서 조직 맞춤 ZIP 또는 OAuth 커넥터 방식을 이용합니다.

## 연결과 권한

MCP 서버 이름은 `docs`입니다. 설치 성공, OAuth 로그인 성공, 문서 접근 권한은 별도로 확인합니다. 연결 확인은 읽기 도구 `list_folders`로 수행합니다. 주소·사용자·토큰을 다른 조직과 공유하지 않습니다. 조직을 전환하려면 환경 변수를 바꾸고 클라이언트를 완전히 다시 시작합니다.

클라이언트가 환경 변수를 받지 못하면 조직 맞춤 ZIP이 주소를 포함한 MCP와 같은 스킬을 제공합니다. 설치된 공개 패키지의 캐시는 직접 수정하지 않습니다.
