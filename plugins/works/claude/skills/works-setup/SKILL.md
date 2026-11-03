---
name: works-setup
description: WORKS.MADANG의 native HTTP MCP 주소·OAuth 로그인·내 연결 관리 방법을 안내하고 연결 오류를 확인한다. 토큰 복사나 client secret 입력은 요청하지 않는다.
---

# WORKS.MADANG 연결

서버 이름은 `works`, MCP 주소는 `https://works.madang.ai/mcp`다. 클라이언트의 native HTTP·OAuth 연결 기능을 사용한다. 공개 OAuth client(`token_endpoint_auth_method=none`)이며 scope는 `works:read` 하나다. 헤더·환경변수·수동 bearer token·client secret 설정을 만들지 않는다.

공개 마켓 설치 이름은 게시 후 `works@madang`이다. 패키지 원천이나 생성 artifact만으로 공개 게시·설치·서버 제공 완료를 말하지 않는다. 공개 게시 전이면 배포 상태를 확인하고 직접 URL 연결 방법을 안내한다.

브라우저에서 조직 로그인과 명시적인 권한 허용을 사용자가 수행하게 한다. 조직 찾기 결과는 인증이 아니다. 조직 전용 `/mcp` 주소를 만들지 않는다. 토큰·인가 code·계정 이메일을 채팅이나 화면 query로 받지 않는다.

조직 화면의 `/me/agent-connections`에서 연결 방법을, `/me/oauth-connections`에서 n/5·최초 연결 시각·해제 기록을 확인할 수 있다. 새 연결 승인으로 상한을 넘으면 가장 먼저 연결한 항목이 해제된다는 화면 예고를 따른다. 연결 해제는 사용자가 지정한 연결에만 수행한다.

성공 여부는 discovery → OAuth 로그인·허용 → `tools/list` → 권한 있는 읽기 1건을 각각 확인한다. 설치 성공만으로 인증·읽기 성공을 대신하지 않는다. 401이면 재인증 여부를 확인하고, 서비스 준비 중·권한 없음·동의 전 상태를 임의 우회하지 않는다.
