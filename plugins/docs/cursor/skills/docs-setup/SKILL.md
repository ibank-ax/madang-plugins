---
name: docs-setup
description: DOCS.MADANG 플러그인의 조직 MCP 주소와 OAuth 연결을 설정하거나 연결 오류를 해결할 때 사용한다.
---

# DOCS.MADANG 조직 연결

공개 플러그인에는 스킬과 MCP 브릿지가 함께 들어 있다. 서비스는 조직별로 분리되어 있으므로 먼저 사용자의 조직 주소를 확인한다. 주소는 해당 조직 콘솔의 설정 > 플러그인.MCP 설정에서 복사한다. `docs.madang.ai/mcp`는 플랫폼 주소이므로 조직 연결에 사용하지 않는다.

1. MCP 주소 `https://조직주소/mcp`를 `DOCS_MADANG_MCP_URL`에 지정한 셸에서 Claude Code·Codex·Cursor를 시작한다. 주소가 없으면 연결을 중단하며 기본 조직으로 임의 연결하지 않는다.
2. 최초 연결 때 브라우저에서 그 조직에 로그인하고 MCP 권한에 동의한다. 플러그인 설치만으로 로그인이나 문서 접근 권한이 생기지 않는다.
3. 읽기 도구 `list_folders`를 호출해 연결을 확인한다. 등록·재처리 도구를 연결 시험으로 실행하지 않는다.
4. GUI가 셸 환경을 받지 못하면 조직 설정에서 조직 맞춤 플러그인 ZIP을 내려받아 설치하거나 OAuth 커넥터 안내를 따른다. 패키지 캐시를 수정하지 않는다.

macOS/Linux:
```bash
export DOCS_MADANG_MCP_URL="https://조직주소/mcp"
codex
# 또는 claude / cursor .
```

Windows PowerShell:
```powershell
$env:DOCS_MADANG_MCP_URL="https://조직주소/mcp"
codex
```

Node.js 20 이상과 npm/npx가 필요하다. 브릿지는 고정 버전 `mcp-remote@0.14.3`를 사용해 stdio를 조직의 HTTPS MCP로 연결하며, OAuth 자격증명은 사용자 기기에 보관된다. Cursor가 이미 실행 중이면 완전히 종료한 뒤 주소를 지정한 셸에서 다시 시작한다.
