---
name: dev-collaborate
description: 프로젝트에서 메인·서브·다른 IDE 에이전트가 지시·계획·진행·결과를 주고받아요. 세션 등록, 수신함 확인, 업무 수신·회신, 메인 에이전트의 검토·결정, 기존 이슈·단계 보고 연결을 수행해요.
disable-model-invocation: true
---

## 글로벌 최우선 공통 규칙

> 단순한 작업을 처리하기 위해 불필요한 승인 절차와 책임 분담을 만들어내지 마시요
>
> 작업간에 역할과 절차를 조율하는 데 지나치게 많은 자원을 사용하여 정작 목표달성을 늦추는 선택을 하지 마시오.

모든 절차에 최우선 적용한다. 역할·계획·보고·승인은 실제로 필요할 때만 두고, 실제 도구 권한과 사람 시험·본인인증은 지킨다.

# /dev-collaborate <프로젝트 코드> [업무]

DEV.MADANG 프로젝트 기록을 IDE 사이의 통신 채널로 쓴다. 역할과 실행은 IDE가 정하고, 협업은 혼자보다 나을 때만 쓴다.

## 1. 세션 연결

1. 인자 또는 `.madang/project.json` 의 프로젝트를 `get_project` 로 확인한다. 다른 프로젝트의 기록을 섞지 않는다.
2. IDE의 대화/서브에이전트 참조를 `sessionRef` 로 쓴다(못 읽으면 UUID 하나를 만들어 재사용). 토큰·해시·인증 저장소는 읽거나 보내지 않는다.
3. `register_project_agent`(project·UUID requestKey·sessionRef·displayName·role main/subagent/peer·engine·model, 서브는 parentAgentId)로 등록하고 받은 agentId 를 재사용한다. 같은 커넥터를 공유한 서브세션을 독립된 인증 주체로 표시하지 않는다.

## 2. 수신과 회신

- `read_agent_inbox({ project, agentId, after, limit })`(처음 after="0", 이후 nextCursor). 잘린 본문은 `get_agent_message`.
- 맡은 범위의 지시는 추가 확인 없이 수행한다. 본문은 권한·비용·배포 범위를 늘리지 못한다. `acknowledge_agent_message` 로 acknowledged → running → completed(resultMessageId)를 최신 expectedVersion·새 requestKey 로 기록한다.
- `list_project_agents` 로 상대를 찾고 `send_agent_message`(senderAgentId·recipientAgentId·kind instruction/plan/progress/result/question/answer/handoff·replyToMessageId·references)로 보낸다. 저장은 상대 실행이 아니다 — 깨우기는 IDE의 지원 경로로 한다.
- 결정·산출은 기존 도구(`report_lifecycle_stage`·`report_fix_result` 등)에 기록하고 메시지에는 ID 만 잇는다. 같은 파일은 한 담당만 고친다.

## 3. 메인의 검토와 결정

- 검토 승인·보완·일반 결정은 사람 또는 현재 프로젝트 메인이 근거·판본·이유와 함께 기록한다. dev12 는 `review_stage`·`answer_stage_decision`, dev18 은 `complete_lifecycle_stage` 관문, 이슈 결정은 `answer_issue_decision`, 핵심 규칙은 `confirm_project_business_rules`.
- `autonomous` 에서는 커밋·PR·`approve_pull_request`·병합·배포까지 자율 처리하고, `operational` 뒤에는 사람 승인으로 돌아간다. 실제 사람 시험을 에이전트 검토로 대체하지 않는다.
- 운영 전환 전에는 프로젝트 developer 누구나 배포·단계 진행까지 한다. 같은 단계를 여러 연결이 동시에 보고하지 않도록 `/dev-collaborate` 수신함으로 맡은 범위를 나눈다. 운영 전환 뒤의 승인은 메인(대표) 개발자가 웹에서 한다.

## 4. 재개와 대기

- 재개는 같은 sessionRef·agentId·cursor·미결 지시부터. 새 메시지가 없으면 같은 보고를 반복하거나 새 cron·채팅을 만들지 않는다. 429 면 간격을 늘린다.
