# DEV.MADANG 플러그인

`dev.madang.ai` 의 MCP 연결과 개발 진행(PM)·검수 스킬을 한 번에 넣어 주는 Claude Code 플러그인이에요.

```bash
claude plugin marketplace add https://github.com/ibank-ax/madang-plugins
claude plugin install dev@madang
```

공개 설치 파일은 `ibank-ax/madang-plugins`에서 배포해요. GitHub 로그인이나 제품 원본 저장소 권한 없이 받을 수 있어요. DEV.MADANG 서비스 사용에는 별도로 회사 계정 로그인과 프로젝트 권한이 필요해요.

기존 제품 저장소에서 설치했다면 마켓플레이스 출처를 공개 주소로 바꾼 뒤 `dev@madang`을 설치해 주세요. 같은 이름의 출처 충돌이 나면 [공개 설치 안내의 출처 변경 절차](https://github.com/ibank-ax/madang-plugins#claude에서-같은-이름의-마켓플레이스-등록이-실패할-때)를 따라 기존 `madang` 출처만 갱신해 주세요. 아래 등록 명령만으로 모든 클라이언트의 기존 출처가 바뀌는 것은 아니에요. 다른 제품 플러그인도 함께 사용할 수 있으므로 `madang` 마켓플레이스 전체를 제거하지 않아요. 이전 `madang@madang`은 새 플러그인의 작동을 확인한 뒤 해당 플러그인만 제거해 주세요.

```bash
claude plugin marketplace add https://github.com/ibank-ax/madang-plugins
claude plugin install dev@madang
```

설치할 때 아무것도 묻지 않아요. 처음 쓸 때 **로그인 창**이 뜨고(회사 계정), 그 뒤로는 토큰이 자동으로 갱신돼요. 권한은 기본으로 읽기·이슈 작업·단계 보고만 열리고, 프로젝트 등록·서버 연결·보호 실행·인프라 문서 등록 등 필요한 권한은 동의 화면에서 직접 켜요. 비밀 원문을 에이전트에 반환하는 용도로 권한을 켜지 않아요. 자격 사용은 보호 실행으로 요청하고 값 대신 참조와 결과를 확인해요.

들어 있는 것

| 종류 | 이름 | 하는 일 |
|---|---|---|
| MCP | `madang` | 프로젝트 등록·18단계 개발 흐름·단계 보고·통합 이슈의 작업/결정/근거·이슈 패킷·캡쳐·서버 연결·보호 실행·인프라 관리 (OAuth 로그인) |
| 스킬 | `/dev:start <코드> [이름]` | /docs 자료로 프로젝트 등록(또는 기존 프로젝트에 폴더 연결) → `.madang/project.json` 저장 → 실제 흐름 버전의 시작 지시 수행 |
| 스킬 | `/dev:go` | 실제 흐름 버전에 맞춰 한 단계를 수행·보고. dev18.v1은 근거 판정과 남은 조건을 PM·상위 실행에 인계하고, 전체 목표를 위임받은 실행은 다음 허용 단계·독립 작업을 계속해요. dev12.v1은 기존 컨펌 절차를 따라요 |
| 스킬 | `/dev:fix <이슈번호>` | 패킷 읽기 → 브랜치 → 수정 → 테스트 → PR → 결과 보고 |
| 스킬 | `/dev:next` | 나에게 온 대기 건을 하나씩 `/dev:fix` 로 처리 |
| 스킬 | `/dev:runbook <카테고리> <폴더>` | 개발 위키 문서를 표준 구조로 정리해 초안으로 제출 |

권한은 로그인한 사람의 역할·프로젝트 범위를 넘지 않아요. 모든 호출은 감사 기록에 남아요.

## 개발 진행(PM) 흐름

```bash
/dev:start SH 쇼핑허브   # 처음 한 번 — 프로젝트 등록·연결 + 시작 지시 확인
/loop 30m /dev:go        # 30분마다 다음 지시 확인 → 허용된 단계 수행·결과 인계
```

- dev18.v1은 단계·작업·결정·근거를 **같은 이슈**에서 확인해요(`/issues/:id`). 위임받은 판단은 자료·고정 위키·필요한 전문가 근거로 진행하고, 사람만 결정하거나 수행할 항목은 같은 이슈에 요청해 해당 의존 작업만 기다려요. 16단계의 실제 사람 시험은 사람이 수행해요. dev12.v1은 진행 탭(`/projects/:id/plan`)의 기존 컨펌 절차를 유지해요.
- 처음 한 번, MCP 로그인 동의 화면에서 ‘프로젝트 등록’ 을 켜야 `/dev:start` 가 프로젝트를 만들 수 있어요(개발자가 `infra_info.md` 를 대신 올리려면 ‘인프라 문서 올리기’ 도).
- Codex 는 자체 플러그인으로 붙어요 — `codex plugin marketplace add https://github.com/ibank-ax/madang-plugins` → `codex plugin add dev@madang`(하위명령이 `install` 이 아니라 `add`, 마켓플레이스 `.agents/plugins/marketplace.json` → `plugins/madang-codex`). 스킬은 `$dev-start` · `$dev-go` · `$dev-fix` · `$dev-next` · `$dev-runbook`(`/skills` 메뉴나 `$` 입력). 반복은 `while :; do codex exec '$dev-go'; sleep 1800; done`.
- Cursor 는 플러그인으로 붙어요 — 팀 마켓플레이스의 **Import from Repo** 에 `https://github.com/ibank-ax/madang-plugins` 를 넣고 `dev` 를 설치하면(마켓플레이스 `.cursor-plugin/marketplace.json` → `plugins/madang-cursor`) MCP·스킬 `/dev-start` · `/dev-go` · `/dev-fix` · `/dev-next` · `/dev-runbook`(명시 호출 전용)·상시 규칙이 함께 들어와요. 반복은 `/loop 30m /dev-go`. MCP 만 붙이려면 `.cursor/mcp.json` 에 `{ "mcpServers": { "madang": { "url": "https://dev.madang.ai/mcp" } } }`.

## 주의

**SKILL.md 는 생성물이에요.** 원천은 `packages/shared/procedures/{start,go,fix,next,runbook}.md` 이고 `npm run gen:agents` 가 이 플러그인의 스킬 5개와 Codex 플러그인(`plugins/madang-codex`, `$dev-*`) · Cursor 플러그인(`plugins/madang-cursor`, `/dev-*`) · 상시 규칙 파일을 함께 내요. 이 원천과 생성기는 비공개 제품 저장소에서 관리하고, `npm run export:plugins -- --target <공개 저장소 작업 폴더>`로 설치 파일만 내보내요. 공개 배포 파일을 직접 고치면 다음 동기화에서 사라져요. 제품 원천의 SKILL.md 를 직접 고치면 `npm test` 가 막아요(2026-09-22, D-60).


**필요한 권한이 없는 기존 연결만 다시 동의해 주세요.** 예를 들어 2.4.0 이전에 연결해 단계 보고(`lifecycle:write`)나 프로젝트 등록(`projects:write`) 권한이 없는 경우에는 해당 기능을 쓰기 전에 MCP에 다시 로그인하고 동의 화면에서 필요한 권한을 켜 주세요. 이미 필요한 권한이 있는 유효 연결은 README나 플러그인을 업데이트했다는 이유로 끊거나 다시 로그인할 필요가 없어요.

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
