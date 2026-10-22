# 개발 가이드 · dev18.v1
> guideVersion: 2.10.4 · sourceDigest: c797a8a0f59b5a7737dad439c70415238ae9a8ccf9481205dd1f74b57287a1c0

- dev18.v1은 배포된 읽기 가이드예요. 현재 단계 실행·보고·전이는 dev12.v1 12단계이며 새 18단계 run 실행은 지원하지 않아요.
- 기존 단계 ID·번호·보고·결정·첨부·배포 기록을 보존하고 완료 상태를 새 번호로 복제하지 않아요.
- 운영 중인 서비스 개선은 기존 등록·유효한 결정·근거를 재사용해요. 초기 등록·전체 18단계 재시작·최초 오픈을 다시 요구하지 않아요. 17단계는 검증된 개선 반영, 18단계는 운영 지속 확인으로 읽어요.
- 가이드 공급·설치·OAuth 연결·실제 IDE 과업은 별도 근거예요. 보호 SSH/Git·중단/재개·13역할 결과 취합은 실제 실행 근거 없이 통과로 표시하지 않아요.
- 위키 활성/과거/목표/결정 필요를 구별해요. 실행 근거는 versionId/nodeKey/contentHash/docVersion/sourceDigest/retrievedAt로 고정하고 활성 판본이 바뀌어도 과거 근거를 덮어쓰지 않아요. 이 가이드는 새 위키 표준의 활성 승인이 아니에요.

## Claude Code
단계 진행: /dev:go
이슈 수정: /dev:fix <이슈번호>
설치 판본 → OAuth·scope → 위키·단계 조회 → 같은 이슈 결정·보고 → 허용된 실제 SSH/Git → 중단/재개·차단 경계를 IDE별로 확인해요. 설치·연결 상태만으로 뒤 과업을 통과시키지 않아요. 도구가 없으면 정리된 인계 자료와 미연결 상태를 남기며 사용자 진행 중 채팅을 임의로 재시작하지 않아요.

## 협업과 인계
PM은 별도 대화에서 목표·분모·의존성을 조율하고 필요한 전문 역할만 실제 슬롯 안에서 배정해요. 요구 ID·현재 판본·허용/제외 범위·질문·파일별 단일 작성자를 전달해요. 작업관리자는 줄일 일 / 근거 / 바로 할 다음 행동을 제안하며 새 승인자가 아니에요. 중복 작업·불필요한 대기를 줄여도 필수 수용 조건과 실제 사람 시험을 삭제하거나 미완료 개발을 사람에게 전가하지 않아요. 편집 종료·진행 명령·branch/HEAD/remote ref·dirty·배포 판본·원격 검수 분모·unknown 대조·잔여/다음 담당을 확인한 뒤 인계해요. 실제 새 실행 연결이 없으면 nextExecutionRef는 null로 남겨요. 외부 사람/메일/Teams 발송은 별도 허용 범위를 확인해요.
동적 참조: pmThreadRef, currentTask, handoffRef, latestInstruction, goal, authorizedScope, priorCompleted, excludedScope, nextTask, nextExecutionRef. 실제 대화 ID·과거 별도 지시를 제품 가이드에 고정하지 않아요.
