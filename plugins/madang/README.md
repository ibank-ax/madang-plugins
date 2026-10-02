# DEV.MADANG 플러그인

`dev.madang.ai` 의 MCP 연결과 개발 진행(PM)·검수 스킬을 한 번에 넣어 주는 Claude Code 플러그인이에요.

```bash
claude plugin marketplace add ibank-ax/dev-plugins
claude plugin install dev@madang
```

공개 설치 파일은 `ibank-ax/dev-plugins`에서 배포해요. GitHub 로그인이나 제품 원본 저장소 권한 없이 받을 수 있어요. DEV.MADANG 서비스 사용에는 별도로 회사 계정 로그인과 프로젝트 권한이 필요해요.

기존 제품 저장소에서 설치했다면 마켓플레이스를 한 번 다시 등록해 주세요. 새 제품 플러그인은 `dev@madang`이에요. 기존 `madang@madang`은 제거한 뒤 설치해 주세요.

```bash
claude plugin uninstall madang@madang
claude plugin marketplace remove madang
claude plugin marketplace add ibank-ax/dev-plugins
claude plugin install dev@madang
```

설치할 때 아무것도 묻지 않아요. 처음 쓸 때 **로그인 창**이 뜨고(회사 계정), 그 뒤로는 토큰이 자동으로 갱신돼요. 권한은 기본으로 읽기·이슈 작업·단계 보고만 열리고, 프로젝트 등록·서버 접속·원격 실행·비밀 열람·인프라 문서 올리기는 동의 화면에서 직접 켜야 붙어요.

들어 있는 것

| 종류 | 이름 | 하는 일 |
|---|---|---|
| MCP | `madang` | 프로젝트 등록·12단계 다음 지시·단계 보고·컨펌 요청·결정 요청·이슈 패킷·캡쳐·서버 접속·프록시 실행·인프라 문서·저장소 푸시 자격 (OAuth 로그인) |
| 스킬 | `/dev:start <코드> [이름]` | /docs 자료로 프로젝트 등록(또는 기존 프로젝트에 폴더 연결) → `.madang/project.json` 저장 → 1단계 지시 수행 |
| 스킬 | `/dev:go` | 「다음 지시」를 받아 한 단계만 수행 — 산출물 작성·커밋·푸시 → 진행 보고 → 컨펌 요청 뒤 멈춤. 사람 차례면 한 줄로 알리고 멈춤 |
| 스킬 | `/dev:fix <이슈번호>` | 패킷 읽기 → 브랜치 → 수정 → 테스트 → PR → 결과 보고 |
| 스킬 | `/dev:next` | 나에게 온 대기 건을 하나씩 `/dev:fix` 로 처리 |
| 스킬 | `/dev:runbook <카테고리> <폴더>` | 지식 런북 문서를 표준 구조로 정리해 초안으로 제출 |

권한은 로그인한 사람의 역할·프로젝트 범위를 넘지 않아요. 모든 호출은 감사 기록에 남아요.

## 개발 진행(PM) 흐름

```bash
/dev:start SH 쇼핑허브   # 처음 한 번 — 프로젝트 등록 + 1단계 시작
/loop 30m /dev:go        # 30분마다 다음 지시 확인 → 에이전트 차례면 수행, 사람 차례면 멈춤
```

- 단계 컨펌·보완 요청·결정 답은 **웹에 로그인한 개발자**만 해요(진행 탭 `/projects/:id/plan`). 에이전트는 보고·컨펌 요청·결정 요청까지만 해요.
- 처음 한 번, MCP 로그인 동의 화면에서 ‘프로젝트 등록’ 을 켜야 `/dev:start` 가 프로젝트를 만들 수 있어요(개발자가 3단계에서 `infra_info.md` 를 대신 올리려면 ‘인프라 문서 올리기’ 도).
- Codex 는 자체 플러그인으로 붙어요 — `codex plugin marketplace add https://github.com/ibank-ax/dev-plugins` → `codex plugin add dev@madang`(하위명령이 `install` 이 아니라 `add`, 마켓플레이스 `.agents/plugins/marketplace.json` → `plugins/dev-codex`). 스킬은 `$dev-start` · `$dev-go` · `$dev-fix` · `$dev-next`(`/skills` 메뉴나 `$` 입력). 반복은 `while :; do codex exec '$dev-go'; sleep 1800; done`.
- Cursor 는 플러그인으로 붙어요 — Settings › Marketplaces › **Import from Repo** 에 `https://github.com/ibank-ax/dev-plugins` 를 넣고 `madang` 을 설치하면(마켓플레이스 `.cursor-plugin/marketplace.json` → `plugins/dev-cursor`) MCP·스킬 `/dev-start` · `/dev-go` · `/dev-fix` · `/dev-next`(명시 호출 전용)·상시 규칙이 함께 들어와요. 반복은 `/loop 30m /dev-go`. MCP 만 붙이려면 `.cursor/mcp.json` 에 `{ "mcpServers": { "madang": { "url": "https://dev.madang.ai/mcp" } } }`.

## 주의

**SKILL.md 는 생성물이에요.** 원천은 `packages/shared/procedures/{start,go,fix,next,runbook}.md` 이고 `npm run gen:agents` 가 이 플러그인의 스킬 5개와 Codex 플러그인(`plugins/dev-codex`, `$dev-*`) · Cursor 플러그인(`plugins/dev-cursor`, `/dev-*`) · 상시 규칙 파일을 함께 내요. 이 원천과 생성기는 비공개 제품 저장소에서 관리하고, `npm run export:plugins -- --target <공개 저장소 작업 폴더>`로 설치 파일만 내보내요. 공개 배포 파일을 직접 고치면 다음 동기화에서 사라져요. 제품 원천의 SKILL.md 를 직접 고치면 `npm test` 가 막아요(2026-09-22, D-60).


**기존 연결은 재연결해야 새 툴이 보여요.** 권한(스코프)은 토큰에 박혀 있어서, 2.4.0 의 단계 보고 툴(`get_next_directive` · `report_stage_progress` 등, 권한 `lifecycle:write`)과 프로젝트 등록(`create_project`, 권한 `projects:write`)은 이전에 연결한 커넥터에는 나타나지 않아요. `/me/mcp` 에서 연결을 끊고 Claude Code 에서 `/mcp` → madang 다시 로그인 → 동의 화면에서 필요한 권한을 켜 주세요.

**설치 환경에서 실제 호출명이 `/dev:start` 인지 확인하세요.** 스킬 호출명은 플러그인 이름 `dev` + SKILL.md 의 `name`(`start` · `go` · `fix` · `next` · `runbook`)이에요. Claude Code 는 스킬을 **폴더 이름**으로 잡기 때문에(2026-09-20 확인) 폴더를 `start`·`go`·`fix`·`next`·`runbook` 로 두어 호출명과 맞췄어요. 설치 뒤 `/` 를 입력해 목록에 뜨는 이름을 확인하고 다르면 알려 주세요(카드·화면 문구는 `SKILL_CMD` 상수 한 곳에서 나가요).

MCP **URL 은 고정 문자열**이어야 해요. `${user_config.*}` 를 쓰면 화면은 매니페스트 원문을, 세션은 치환된 값을 보게 돼서 커넥터 로그인이 "다른 서버 URL" 이라며 막혀요(2026-09-19). 다른 주소로 붙여야 하면 이 플러그인을 포크해서 URL 을 바꾸세요.

플러그인 MCP 는 2.3.0 부터 **OAuth 로 인증**해요(헤더에 토큰을 박지 않아요). 브라우저를 못 쓰는 환경(CI 등)에서는 플러그인 대신 `claude mcp add --transport http … --header "Authorization: Bearer <PAT>"` 를 쓰세요.

## 고칠 때

**`version` 을 올리지 않으면 푸시해도 설치된 사람에게 가지 않아요.** 스킬 문구나 MCP 설정을 바꿨다면 `packages/shared/src/constants.ts` 의 `PLUGIN_VERSION` 하나를 올리고 `npm run gen:agents` 를 돌리세요 — 매니페스트·마켓플레이스 파일(Claude·Codex·Cursor)이 같은 값으로 바뀌고, 테스트가 한쪽만 다른 것을 잡아요(마켓플레이스 엔트리가 우선이라 한쪽만 올리면 엇갈려요).

생성 후 공개 배포 저장소로 내보내고 별도 브랜치·PR로 반영해야 설치 사용자가 새 버전을 받아요. 앱 소스·내부 문서·비밀값은 내보내지 않아요.

받는 쪽은 이렇게 갱신해요.

```bash
claude plugin marketplace update madang
claude plugin update dev@madang
```

MCP **툴**이 늘어난 것은 플러그인과 무관해요 — 툴은 서버가 내므로 배포하면 바로 반영돼요. 다만 **권한(스코프)** 은 토큰에 박혀 있어서, 새로 생긴 권한이 필요하면 커넥터를 다시 연결해야 해요.

업데이트 뒤 `claude mcp list` 에 `plugin:dev:madang` 이 안 보이면 플러그인이 꺼진 거예요(2026-09-19 에 2.0.0 → 2.1.0 업데이트에서 겪었어요). 토큰은 그대로 있으니 켜기만 하면 돼요.

```bash
claude plugin enable dev@madang
```
