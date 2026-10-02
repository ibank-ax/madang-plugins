# 공개 플러그인 배포 절차

이 저장소는 제품별 플러그인 배포물과 설치 카탈로그를 관리합니다. 제품 서버 코드, 비밀 문서, 고객 자료를 포함하지 않습니다. 제품별 원천과 공개 배포물은 별도 저장소에서 관리합니다.

## 원천과 배포물

DEV.MADANG의 절차 원문은 제품 저장소의 `packages/shared/procedures/*.md`, 엔진 명령은 `packages/shared/src/engines.ts`, 버전은 `packages/shared/src/constants.ts`의 `PLUGIN_VERSION`입니다. 제품의 `npm run gen:agents`가 Claude Code, Codex, Cursor 패키지와 마켓플레이스를 생성합니다.

공개 저장소의 `plugins/**`와 생성된 카탈로그를 손으로 수정하지 않습니다. 제품 원천을 수정하고 생성기를 실행한 뒤 exporter로 다시 내보냅니다. 공개 저장소에만 패키지를 수정하면 다음 export에서 사라지므로 수정 PR은 원천 변경과 연결해야 합니다.

마켓플레이스 이름은 `madang`, DEV.MADANG의 제품 플러그인 이름은 `dev`로 관리합니다. 설치 식별자는 `dev@madang`이며 Claude Code 스킬은 `/dev:*`, Codex는 `$dev-*`, Cursor는 `/dev-*`입니다. DOCS.MADANG의 설치 식별자는 `docs@madang`입니다. 제품별 설치 이름과 스킬 이름은 제품 원천에서 함께 관리합니다. MCP 서버 이름은 `madang`으로 유지하며 Claude Code 연결 식별자는 `plugin:dev:madang`입니다. 공개 저장소 README, 유지보수 안내, 검증기와 워크플로는 이 저장소에서 관리합니다.

## DEV.MADANG 변경 배포

1. 제품 저장소의 작업 브랜치에서 원천을 수정합니다. 스킬·매니페스트·설치 안내가 달라지면 `PLUGIN_VERSION`을 올립니다.
2. 제품 저장소에서 생성물을 갱신합니다. 버전을 올린 뒤 생성해야 모든 매니페스트와 카탈로그의 버전이 같아집니다.

   ```bash
   npm run gen:agents
   ```

3. 제품 원천 변경을 커밋하고 푸시합니다. 제품 저장소의 리뷰·배포 절차를 따릅니다. 공개 등록 메타데이터의 `sourceCommit`은 배포물을 생성한 제품 원천의 커밋을 가리켜야 합니다.
4. 공개 저장소에서 별도 작업 브랜치를 만들고, 제품 저장소에서 공개 패키지를 export합니다. 대상은 공개 저장소의 절대 경로입니다.

   ```bash
   npm run export:plugins -- --target /절대/경로/madang-plugins
   ```

5. 공개 저장소의 diff를 확인합니다. 제품 버전, 스킬 변경, 설치 주소, `products/dev-madang.json`의 `sourceCommit`을 제품 변경과 대조합니다. `apps/`, `packages/`, `docs/env/`, `.env*`, 키·인증서 파일이나 고객 자료가 들어가지 않아야 합니다.
6. 공개 저장소 작업 브랜치에서 커밋·푸시하고 PR을 만듭니다. 기본 브랜치에 직접 푸시하지 않습니다. PR의 GitHub Actions가 Node.js 22의 내장 기능만으로 `node scripts/validate.mjs`를 실행합니다. 별도 npm 의존성을 설치하지 않습니다.
7. 공개 반영 후 원격 검증 작업에서 인증 정보 없이 공개 URL을 clone해, 카탈로그와 패키지가 익명으로 내려오는지 확인합니다. 각 플랫폼에서 마켓플레이스 등록 → `dev@madang` 설치 → 스킬 표시 → MCP OAuth 연결을 확인합니다. 로그인 권한 확인은 공개 다운로드 확인과 별도로 기록합니다.

카탈로그 스키마 검증과 별도로 실제 Codex CLI의 마켓플레이스 등록·설치를 원격 환경에서 확인하고 결과를 남깁니다.

익명 clone 검증에서는 저장된 Git 자격증명과 `GH_TOKEN`·`GITHUB_TOKEN`을 사용하지 않습니다. 확인한 공개 커밋과 제품 원천 커밋, 제품 버전, 플랫폼별 결과를 PR 또는 릴리스 기록에 남깁니다.

## DOCS.MADANG 변경 배포

DOCS의 원천은 제품 저장소의 `apps/backend/app/services/mcp/client_bundle.py`(버전·공용 문서 스킬), `public_bundle.py`(매니페스트·설정 스킬·카탈로그), `docs-mcp-bridge.mjs`(조직 연결 브릿지)입니다. 제품 원천 변경을 커밋·푸시한 뒤 공개 저장소의 작업 브랜치에 아래 exporter로 허용 파일만 내보냅니다.

```bash
python3 scripts/export-public-plugins.py --target /절대/경로/madang-plugins
```

exporter는 제품 원천이 커밋되어 있는지, 대상의 origin과 작업 브랜치를 확인합니다. `plugins/docs/{claude,codex,cursor}/`, `products/docs.json`, 카탈로그의 `docs` 엔트리만 갱신하며 다른 제품은 보존합니다. `sourceCommit`은 제품 원천의 전체 SHA입니다. DEV 절차와 같이 공개 PR → CI → 반영 → 익명 clone → 플랫폼별 실제 설치를 확인합니다.

공개 DOCS 패키지는 MCP 주소를 하드코딩하지 않습니다. 사용자가 조직 설정에서 복사한 `DOCS_MADANG_MCP_URL`을 지정한 뒤 클라이언트를 시작하고 OAuth로 로그인합니다. 주소가 없거나 플랫폼 주소이면 연결을 중단합니다. Node.js 20 이상과 npm/npx를 요구하며 `mcp-remote@0.14.3`로 stdio를 조직의 HTTPS MCP에 연결합니다. 조직 맞춤 ZIP은 제품 API가 해당 조직 주소로 생성하며 공개 저장소에 내보내지 않습니다. 실제 MCP 권한 검증은 공개 패키지 다운로드·설치와 별도로 수행합니다.

## 등록 메타데이터와 카탈로그

제품 등록은 `products/<제품-id>.json`으로 남깁니다. 최소 필드는 제품 버전 `version`과 원천의 40자리 Git SHA `sourceCommit`입니다. 서버 주소·계정·토큰·개인 경로를 넣지 않습니다.

카탈로그는 `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, `.cursor-plugin/marketplace.json`입니다. 각 엔트리는 공개 저장소 안의 상대 패키지 경로를 가리킵니다. 카탈로그 버전, 매니페스트 버전, 해당 제품의 등록 버전은 같아야 합니다. DEV.MADANG은 플러그인 이름 `dev`를 등록 파일 `products/dev-madang.json`에 연결합니다. 패키지 폴더명은 현재 `plugins/madang`, `plugins/madang-codex`, `plugins/madang-cursor`이며 설치 이름과 별도로 관리합니다. Claude Code의 스킬 폴더는 `start`·`go`·`fix`·`next`·`runbook`, Codex와 Cursor는 `dev-start`·`dev-go`·`dev-fix`·`dev-next`·`dev-runbook`입니다.

새 제품은 조직 승인을 받은 뒤 원천 exporter와 함께 추가합니다. 기본적으로 플러그인 이름을 제품 등록 파일의 id에 연결합니다. 두 이름이 다르면 카탈로그 엔트리에 `product`를 지정해 `products/<product>.json`과 연결합니다. 제품별로 지원하는 플랫폼을 등록하며, 아직 만들지 않은 패키지를 카탈로그에 올리지 않습니다.

## 공개 범위

공개 패키지에는 설치에 필요한 매니페스트, 스킬, 상시 규칙과 승인된 자산만 포함합니다. 런타임 MCP URL은 HTTPS여야 하며 URL에 자격증명을 넣지 않습니다. DEV.MADANG의 MCP 주소는 `https://dev.madang.ai/mcp`입니다. 공개 설치는 서비스 접근 권한을 부여하지 않으며, 현재 DEV.MADANG 서비스는 기업 로그인 정책을 따릅니다.

새 제품을 추가할 때에는 조직 승인, 공개 포함 범위, 설치 경로, 서비스 인증 조건과 필요한 라이선스·사용 조건을 검토합니다. 기존 private 제품 저장소를 공개로 전환하거나 라이선스를 임의로 추가하지 않습니다.

## 검증 실패 처리

검증기는 카탈로그와 매니페스트 연결, 등록 버전과 원천 SHA, DEV.MADANG 스킬 누락, MCP 주소, 금지 파일과 실제 비밀 패턴을 확인합니다. `<PAT>` 같은 안내용 자리표시자나 비밀값을 적지 말라는 보호 문구는 비밀값으로 판정하지 않습니다.

실패하면 제품 원천 또는 exporter를 수정하고 배포물을 다시 export합니다. 검증을 통과시키기 위해 생성된 공개 패키지만 고치거나 비밀 검사 규칙을 완화하지 않습니다. 배포 후 설치 실패가 발견되면 공개 카탈로그와 패키지를 마지막 검증 버전으로 되돌리고 제품 원천의 수정 PR로 연결합니다.
