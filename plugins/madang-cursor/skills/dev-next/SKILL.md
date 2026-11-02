---
name: dev-next
description: 나에게 온 DEV.MADANG 수정 요청을 하나씩 처리해요. 대기 건을 가져와 /dev-fix 절차를 순서대로 수행합니다.
disable-model-invocation: true
---

# /dev-next

나에게 배정된 수정 요청을 하나씩 끝낸다.

1. `list_my_fix_requests({ status: ["sent"] })` 로 대기 건을 가져온다. 없으면 「대기 중인 수정 요청이 없어요」 라고만 답하고 끝낸다.
2. 중요도(심각 → 우려 → 보통)와 보낸 시각 순으로 하나를 고른다. 무엇을 고를지 한 줄로 알리고 시작한다.
3. 그 이슈 번호로 `/dev-fix` 의 절차를 그대로 수행한다(패킷 읽기 → start_fix → 브랜치 → 수정 → 테스트 → PR → report_fix_result).
4. 한 건이 끝나면 결과를 한 줄로 요약하고 남은 건수를 알린다. 사용자가 전체 대기 작업을 맡겼다면 다음 허용 건을 계속한다. 한 건만 맡겼다면 해당 결과를 메인 에이전트 또는 사용자에게 반환한다. 각 프로젝트에서는 `/dev-collaborate`의 세션·수신함·회신 절차를 적용한다.

확신이 없으면 고친 척하지 말고 `report_fix_result` 에 `needs_human` 으로 보고한다.

반자동 운용은 `/loop 30m /dev-next`.
