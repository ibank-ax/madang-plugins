---
name: knowledge
description: DOCS.MADANG(Madang Docs) 문서 저장소를 MCP 로 찾고·읽고·등록할 때 쓴다. 회사 문서에서 근거를 찾아 답하거나, 문서를 저장소에 올려 처리하거나, DOCS.MADANG DOC/PPT 에이전트와 같은 방식으로 문서·발표자료를 만들 때 사용한다.
---

# DOCS.MADANG 문서 저장소

도구는 모두 로그인한 계정의 권한·가시성으로 동작한다. 응답의 `url` 은 웹 콘솔에서 그 문서(페이지)를 여는 주소다 — 사용자에게 근거와 함께 보여 준다.

## 찾기
- `search_documents_text` — `mode` 로 고른다. 한 단어·고유명사는 `keyword`, 문장·질문은 `embedding`, 모르면 `hybrid`(키워드 우선, 남은 자리를 임베딩이 채움). `limit` 1~100, `min_similarity` 0~1(기본 0.7).
- 결과가 적으면 `min_similarity` 를 0.4~0.5 로 낮추고 `limit` 을 올려 다시 찾는다. 응답에 `truncated` 가 있으면 조건을 좁혀 다시 찾는다.
- 개념·관계를 묻는 질문은 `search_documents_semantic`(지식 그래프). 인덱싱이 끝난 문서만 걸린다 — 비면 텍스트 검색으로 돌아간다.
- 범위를 좁힐 때는 `list_folders` / `list_documents` 로 `folder_id` 를 잡는다.

## 읽기
- 스니펫만 보고 단정하지 말고 `read_document_page(document_id, page)` 로 원문·정제본을 확인한다.
- 긴 문서는 `read_document_text` 를 `next_page` 가 null 이 될 때까지 이어 부른다.

## 등록·처리
1. `list_folders` 에서 `can_upload: true` 인 폴더, `list_ontology_sets` 에서 셋 `code` 를 고른다.
2. 작은 텍스트 파일은 `save_file`(base64), 큰 파일은 `create_upload` → 받은 URL 로 HTTP PUT → `complete_upload`.
3. `get_document` 의 `latest_job` 으로 진행을 보고, 지식 그래프에 올리려면 완료 뒤 `rerun_document_stage(stage="ontology")`.
4. 처리 결과는 응답의 `url` 을 열어 확인하라고 안내한다.

## 문서·발표자료 만들기
- `get_agent_playbook(agent="doc"|"ppt")` 의 `markdown` 을 작업 지침으로 삼는다 — 단계, 요구 수집 체크리스트, 산출물 계약, 도구 대응표가 들어 있다.
- 디자인은 `list_design_systems` → `get_design_system` → `read_design_system_file`(토큰 CSS·컴포넌트 샘플·가이드) 순서로 참고한다.
