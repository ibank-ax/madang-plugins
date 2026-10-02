# DOCS.MADANG — docs@madang

스킬과 **원격 HTTP MCP·OAuth 커넥터**를 함께 설치합니다. 기본 MCP 주소는 `https://docs.madang.ai/mcp`입니다. 설치 후 OAuth 로그인에서 소속 조직을 선택합니다. 조직 URL 환경 변수·Node.js·로컬 MCP 브릿지는 필요하지 않습니다.

## Claude Code

```bash
claude plugin marketplace add https://github.com/ibank-ax/madang-plugins
claude plugin install docs@madang
claude
```

`/mcp` → docs → Authenticate에서 브라우저 로그인·조직 선택·연결 승인을 진행합니다. `/docs:setup`, `/docs:knowledge` 스킬이 제공됩니다.

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

MCP 연결 목록에서 DOCS.MADANG의 OAuth 로그인을 진행합니다. 새 대화에서 `$docs-setup`, `$docs-knowledge`를 사용할 수 있습니다. 원격 MCP URL이 클라이언트에 직접 등록됩니다.

## Cursor

Teams/Enterprise의 Dashboard > Plugins & MCPs > Team Marketplaces > Add Marketplace > Import from Repo에서 `https://github.com/ibank-ax/madang-plugins`를 등록하고 Customize에서 `docs`를 설치합니다. MCP 설정에서 Connect를 눌러 OAuth로 로그인합니다. `/docs-setup`, `/docs-knowledge`를 사용할 수 있습니다.

팀 정책이나 요금제에 따라 저장소 가져오기 메뉴가 없으면 조직 콘솔의 OAuth 커넥터 안내 또는 조직 맞춤 ZIP을 사용합니다.

## 연결과 권한

MCP 서버 이름은 `docs`입니다. 첫 로그인에서 이메일로 소속 조직을 찾고, 해당 조직 계정으로 로그인·승인합니다. 승인한 계정의 역할·문서 가시성·쓰기 권한을 따릅니다. 연결 확인은 읽기 도구 `list_folders`로 수행합니다.

폴더 생성·문서 이동·공유 신청도 계정 권한으로 실행합니다. 공유 신청은 조직의 승인 절차를 따릅니다. 다른 조직으로 전환하려면 기존 OAuth 연결을 해제하고 다시 로그인합니다. 토큰을 다른 조직과 공유하지 않습니다.

HTTP 미지원 도구는 조직 설정의 **기타 도구(stdio)**에서 `mcp-remote` 대체 경로를 사용할 수 있습니다. 기본 공개 플러그인에는 stdio 프로세스가 없습니다. 조직 맞춤 ZIP은 조직 주소를 직접 포함한 native HTTP·OAuth 구성입니다.
