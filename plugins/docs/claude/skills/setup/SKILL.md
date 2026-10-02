---
name: setup
description: DOCS.MADANG 플러그인의 원격 OAuth MCP 연결과 조직 로그인을 설정하거나 연결 오류를 해결할 때 사용한다.
---

# DOCS.MADANG 연결

공개 플러그인은 스킬과 원격 HTTP MCP를 함께 등록한다. MCP 주소는 `https://docs.madang.ai/mcp`이며, 브릿지 실행이나 조직 URL 환경 변수는 필요하지 않다.

1. 클라이언트의 MCP 연결 목록에서 `docs`의 OAuth 로그인을 시작한다. Claude Code는 `/mcp` → docs → Authenticate를 사용한다. Codex·Cursor는 MCP 연결의 로그인/Connect를 사용한다.
2. 브라우저에서 가입하거나 초대받은 이메일로 조직을 찾고, 선택한 조직 계정으로 로그인한다. 조직과 계정을 확인하고 연결을 승인한다. 설치만으로 문서 접근 권한이 생기지 않는다.
3. 읽기 도구 `list_folders`를 호출해 조직과 접근 가능한 폴더를 확인한다. 쓰기 도구를 연결 시험으로 실행하지 않는다.
4. 다른 조직으로 바꾸려면 기존 OAuth 연결을 해제하고 다시 로그인한다. 토큰은 조직과 MCP 자원에 귀속된다. 조직 주소를 직접 등록한 OAuth 커넥터와 조직 맞춤 ZIP도 사용할 수 있다.

HTTP를 지원하지 않는 도구만 조직 콘솔의 설정 > 플러그인.MCP 설정 > 기타 도구(stdio) 안내를 따른다. 공개 플러그인 패키지 캐시를 수정하지 않는다.
