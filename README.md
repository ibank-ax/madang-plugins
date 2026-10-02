# MADANG Plugins

MADANG 제품의 설치 패키지를 배포하는 공개 저장소입니다. 현재 DEV.MADANG의 Claude Code, Codex, Cursor 플러그인을 제공합니다.

플러그인을 받는 데 DEV.MADANG 원본 저장소의 GitHub 권한은 필요하지 않습니다. DEV.MADANG 설치 이름은 `dev@madang`입니다. 서비스 연결은 별도 OAuth 로그인으로 인증하며, 현재 DEV.MADANG은 회사 Entra 계정과 프로젝트 권한이 있어야 사용할 수 있습니다.

제품별 이름을 같은 `madang` 마켓플레이스에서 관리합니다. 향후 DOCS.MADANG은 `docs@madang`으로 추가할 수 있으며, 현재는 등록되어 있지 않습니다.

## 설치

### Claude Code

```bash
claude plugin marketplace add ibank-ax/madang-plugins
claude plugin install dev@madang
```

스킬은 `/dev:start`, `/dev:go`, `/dev:fix`, `/dev:next`, `/dev:runbook`으로 호출합니다. 처음 MCP를 사용할 때 DEV.MADANG 로그인과 권한 동의를 완료합니다.

### Codex

```bash
codex plugin marketplace add https://github.com/ibank-ax/madang-plugins
codex plugin add dev@madang
```

설치 후 새 대화에서 `$dev-start`, `$dev-go`, `$dev-fix`, `$dev-next`, `$dev-runbook`을 사용할 수 있습니다.

### Cursor

Settings → Marketplaces → Import from Repo에 아래 주소를 등록하고 DEV.MADANG 플러그인을 설치합니다.

```text
https://github.com/ibank-ax/madang-plugins
```

스킬은 `/dev-start`, `/dev-go`, `/dev-fix`, `/dev-next`, `/dev-runbook`으로 호출합니다.

## 기존 설치를 옮길 때

기존 `madang@madang` 플러그인을 제거하고, `ibank-ax/dev.madang.ai` 마켓플레이스를 공개 배포 저장소로 교체한 뒤 `dev@madang`을 설치합니다. 마켓플레이스 이름은 `madang`, 제품 플러그인 이름은 `dev`입니다. Claude Code 호출은 `/dev:*`, Codex는 `$dev-*`, Cursor는 `/dev-*`로 바뀝니다. MCP 서버 이름 `madang`과 서비스 주소는 유지됩니다.

Claude Code:

```bash
claude plugin uninstall madang@madang
claude plugin marketplace remove madang
claude plugin marketplace add ibank-ax/madang-plugins
claude plugin install dev@madang
```

Codex에서는 플러그인 설정에서 기존 `madang@madang`을 제거한 뒤 등록합니다.

```bash
codex plugin marketplace remove madang
codex plugin marketplace add https://github.com/ibank-ax/madang-plugins
codex plugin add dev@madang
```

Cursor에서는 기존 DEV.MADANG 플러그인과 저장소의 마켓플레이스를 제거한 뒤 새 주소를 Import from Repo로 등록하고 `dev`를 설치합니다. 설치 후 새 대화에서 스킬이 보이고 MCP 연결이 가능한지 확인합니다. 서비스 권한을 새로 동의해야 하는 경우에는 MCP에 다시 로그인합니다.

## 배포와 유지보수

이 저장소의 플러그인은 각 제품의 원천에서 생성한 배포물입니다. 패키지를 손으로 수정하지 않습니다. 변경과 제품 추가 절차는 [CONTRIBUTING.md](CONTRIBUTING.md)를 따릅니다. 다른 MADANG 제품은 조직 승인을 받은 뒤 추가합니다.
