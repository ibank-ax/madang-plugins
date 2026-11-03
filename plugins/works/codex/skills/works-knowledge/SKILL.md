---
name: works-knowledge
description: WORKS.MADANG에서 연결 문맥과 내 업무·프로젝트·운영·회의의 제목·상태·일정 메타데이터를 조직 권한으로 읽는다. 본문·거래·결재 목록·쓰기·발송은 포함하지 않는다.
---

# WORKS.MADANG 읽기

연결된 `works` MCP 도구를 사용한다. 처음 조직 문맥이 필요하면 인자 없는 `get_connection_context`로 연결 계정·조직을 확인한다. 표시값이 없으면 확인 불가로 남기며 조직이나 계정을 추정하지 않는다.

사용자의 요청에 필요한 읽기 도구만 호출한다. 프로젝트 열람은 `list_projects`로 찾고 `get_project`로 읽는다. 서버가 제공하는 현재 도구 설명·페이지 크기를 따르며, 사용자가 보낸 tenant·조직 식별자로 권한 경계를 바꾸지 않는다. 권한 밖 객체를 찾지 못해도 그 존재를 추정하지 않는다.

권한은 `works:read` 하나다. 제공 도구는 `get_connection_context`, `list_projects`, `get_project`, `list_operations`, `get_operation_summary`, `list_my_tasks`, `get_my_task`, `list_my_meetings`, `get_meeting`의 9개다. 제목·상태·일정 메타데이터만 읽으며 회의 녹취·요약 본문·거래·결재 목록/본문·첨부·근태·경비·영수증·메일·파일 본문은 제외한다. MCP로 쓰기·발송·승인·모델 호출을 시도하지 않는다.

연결 오류나 401이면 `works-setup`의 OAuth 연결 절차로 안내한다. 결과에 실제 연결 조직과 읽은 범위를 구별하고, 토큰·인가 code·이메일 원문을 로그·공유 산출물에 옮기지 않는다.
