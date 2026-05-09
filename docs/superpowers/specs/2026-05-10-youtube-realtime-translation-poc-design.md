# YouTube Realtime Translation PoC Design

작성일: 2026-05-10
상태: 승인된 디자인

## 배경

LinguaForge의 첫 PoC는 Chrome에서 재생 중인 YouTube 영어 라이브 또는 영상을 캡처해 한국어 실시간 통역 음성과 한국어 자막을 제공하는 localhost 웹 앱이다. 기존 `docs/youtube-realtime-translation-poc.md`의 최소 구현 방향은 유지하되, 실사용 품질 검증에 필요한 안전장치와 컨트롤을 처음부터 포함한다.

이번 PoC의 성공 기준은 일반 영어 콘텐츠와 기술 콘텐츠를 보면서 한국어 음성 및 자막이 실사용 가능하게 느껴지는지 확인하는 것이다. 저장, 후처리, 전문용어 보정, React 전환은 핵심 검증 이후의 다음 단계로 둔다.

## 목표

- Chrome 탭에서 재생 중인 YouTube 오디오를 캡처한다.
- OpenAI `gpt-realtime-translate` WebRTC Translation 세션으로 오디오를 전송한다.
- 한국어 통역 음성을 재생하고 한국어 자막을 크게 표시한다.
- 원본 오디오와 번역 오디오의 볼륨을 각각 조절할 수 있게 한다.
- 30분 무음 종료, 120분 최대 세션 종료, 수동 종료를 지원한다.
- 종료 후 한국어 자막 로그를 Markdown 세션 문서로 다운로드한다.

## 비목표

- React, Vite, Flutter 등 별도 앱 프레임워크 도입.
- 서버 배포, HTTPS, 모바일/외부 접속 지원.
- 영어 원문 자막 UI 또는 원문 transcript 저장.
- glossary, custom instructions, voice selection 적용.
- transcript 후처리 번역, 요약, 전문용어 보정.
- DB 저장, 계정, 사용량 대시보드, 다중 사용자 지원.

## 현재 OpenAI API 제약

공식 문서 기준으로 `gpt-realtime-translate`는 대상 출력 언어 중심으로 구성되며, 현재 custom prompting, glossary, voice selection 파라미터를 지원하지 않는다. 따라서 이번 PoC는 모델 기본 통역 품질만 평가한다. 기술 콘텐츠에서 전문용어가 어색할 수 있다는 점은 검증 결과로 기록하되, 실시간 세션에 보정 지시를 넣는 설계는 포함하지 않는다.

## 접근안

선택한 접근은 단단한 단일 HTML PoC다. `Node + Express + public/index.html` 구조를 유지하면서 원본/번역 볼륨 믹스, 자동 종료, 명확한 오류 상태, Markdown 다운로드를 추가한다.

문서 그대로의 최소 PoC는 연결 검증은 빠르지만 비용 방치와 실사용 비교에 약하다. Vite/React 기반 PoC는 UI 확장성은 좋지만, 현재 핵심 리스크가 프론트엔드 구조가 아니라 탭 오디오 캡처, WebRTC 연결, 통역 품질이므로 후속 계획으로 둔다.

## 아키텍처

PoC는 `yt-translate-poc/` 하위의 작은 Node 앱으로 만든다.

서버는 Express 하나만 사용한다. 역할은 정적 파일 서빙과 `/session` API 제공으로 제한한다. OpenAI API key는 서버의 `.env`에만 저장하고, 브라우저에는 OpenAI에서 발급받은 단기 `client_secret`만 전달한다.

브라우저는 단일 `public/index.html`에서 모든 상태와 UI를 관리한다. 사용자가 시작 버튼을 누르면 Chrome `getDisplayMedia()`로 YouTube 탭 오디오를 캡처한다. 캡처된 오디오 트랙은 `RTCPeerConnection`에 붙여 OpenAI Realtime Translation WebRTC call endpoint로 보낸다.

OpenAI에서 돌아온 remote audio track은 번역 음성 `<audio>`에 연결한다. Data channel에서 들어오는 한국어 output transcript delta는 큰 자막 영역과 Markdown 다운로드용 로그에 누적한다. 영어 input transcript는 이번 PoC에서 표시하거나 저장하지 않는다.

원본 오디오는 같은 캡처 스트림을 별도 `<audio>`에 연결한다. 사용자는 원본 볼륨과 번역 볼륨을 슬라이더로 각각 조절한다. 기본값은 번역 음성을 크게, 원본 음성은 작게 또는 0에 가깝게 둔다.

가능한 브라우저에서는 `getDisplayMedia` 오디오 옵션에 `suppressLocalAudioPlayback: true`를 요청해 캡처된 YouTube 탭의 원본 소리가 로컬 스피커로 직접 재생되는 것을 줄인다. 브라우저가 이 옵션을 지원하지 않거나 무시하면 사용자가 YouTube 탭의 직접 출력과 PoC 페이지의 원본 오디오를 동시에 들을 수 있으므로, 상태 메시지에 "원본 탭 소리가 별도로 들리면 YouTube 탭 볼륨을 낮추고 PoC 페이지 볼륨으로 조절하세요"라고 안내한다.

## UI와 사용 흐름

첫 화면은 실사용 테스트에 필요한 컨트롤만 제공한다.

- 시작 버튼
- 종료 버튼
- 대상 언어 선택, 기본값 `ko`
- 세션 상태
- 경과 시간
- 원본 볼륨 슬라이더
- 번역 볼륨 슬라이더
- 한국어 자막 영역
- 종료 후 Markdown 다운로드 버튼

시작 전 상태 메시지는 Chrome 탭 공유 다이얼로그에서 탭 오디오 공유 체크박스를 켜야 한다는 점을 명확히 안내한다.

자막 영역은 한국어 번역 자막만 크게 표시한다. 새 delta가 도착하면 자동 스크롤하고, 누적된 텍스트는 종료 후 Markdown 파일 본문으로 사용한다.

종료 후 Markdown 다운로드 버튼이 활성화된다. 파일에는 시작 시각, 종료 시각, 대상 언어, 종료 사유, 총 세션 길이, 한국어 자막 본문을 담는다.

## 세션 상태와 데이터 흐름

세션 상태는 다음 순서로 전이한다.

1. `idle`
2. `requesting-capture`
3. `creating-session`
4. `connecting`
5. `translating`
6. `ended` 또는 `error`

시작 시 브라우저는 먼저 `getDisplayMedia({ video: true, audio: { suppressLocalAudioPlayback: true } })` 형태로 탭 캡처를 요청한다. 브라우저 호환성 문제가 있으면 `audio: true`로 fallback한다. 오디오 트랙이 없으면 세션을 만들지 않고 복구 가능한 오류를 표시한다. 비디오 트랙은 탭 선택 권한 획득에만 사용하고 즉시 중지한다.

브라우저는 `/session`에 `targetLanguage`를 전달한다. 서버는 OpenAI `realtime/translations/client_secrets`에 요청하고, `session.audio.output.language`를 지정한다. 모델은 `gpt-realtime-translate`를 사용한다.

브라우저는 받은 `client_secret`으로 SDP offer를 OpenAI translation call endpoint에 POST한다. SDP answer를 remote description으로 설정하면 통역 세션이 시작된다.

Data channel 이벤트 중 한국어 output transcript delta만 화면과 로그에 누적한다. 이벤트 이름은 구현 시 공식 예제와 실제 응답을 기준으로 확인하며, 알 수 없는 이벤트는 무시하되 디버깅을 위해 개발자 콘솔에 남길 수 있다.

## 종료 정책

종료 경로는 세 가지다.

- 사용자가 종료 버튼을 누르는 수동 종료.
- 원본 오디오가 30분 연속 무음일 때 자동 종료.
- 세션 시작 후 120분이 지나면 최대 세션 시간으로 자동 종료.

추가로 사용자가 Chrome 탭 공유를 중단하거나 캡처된 오디오 트랙이 끝나면 자동 종료한다.

모든 종료 경로는 같은 cleanup 함수를 통과한다. Cleanup은 peer connection close, media track stop, audio `srcObject` 해제, timer 정리, 상태 업데이트, Markdown 다운로드 활성화를 수행한다. 종료 사유는 Markdown 메타데이터에 기록한다.

무음 감지는 캡처된 원본 오디오 스트림에 `AudioContext`와 `AnalyserNode`를 붙여 RMS 기준으로 판단한다. Threshold와 검사 주기는 PoC 상수로 둔다. UI에서 threshold를 조정하는 기능은 후속 계획으로 둔다.

## 오류 처리

탭 오디오 공유 체크 누락은 가장 흔한 오류로 본다. 캡처 스트림에 audio track이 없으면 "탭 오디오 공유를 체크해야 합니다"처럼 사용자가 바로 조치할 수 있는 메시지를 보여준다.

OpenAI 세션 생성 실패, SDP call 실패, WebRTC 연결 실패는 화면에 짧은 오류 메시지를 표시하고 상세 내용은 `console.error`에 남긴다. 실패 시 열린 media track, peer connection, timer를 모두 정리해 재시작이 가능해야 한다.

서버는 `OPENAI_API_KEY`가 없으면 명확한 오류 응답을 반환한다. 브라우저로 실제 API key를 전달하지 않는다.

## 비용 안전장치

PoC는 비용 폭주를 줄이기 위해 다음 안전장치를 포함한다.

- 120분 최대 세션 종료.
- 30분 무음 자동 종료.
- 탭 공유 중단 시 자동 종료.
- 세션 경과 시간 표시.
- 종료 후 재시작 전 기존 리소스 정리.

첫 5분 테스트 후 OpenAI Usage에서 실제 비용을 확인하고, 이후 1시간 추정 비용을 기록한다. 계정 Spending Limit 설정은 운영 절차 문서의 권장 항목으로 남긴다.

## Markdown 다운로드

다운로드 파일은 브라우저에서 생성한다. 서버 저장은 하지 않는다.

파일명은 `youtube-translation-YYYYMMDD-HHMM.md` 형식으로 만든다. 본문 구조는 다음과 같다.

```markdown
# YouTube Translation Session

- Started: 2026-05-10T00:00:00+09:00
- Ended: 2026-05-10T00:05:00+09:00
- Duration: 5m 0s
- Target language: ko
- End reason: manual

## Korean Transcript

...
```

자막 delta는 들어오는 즉시 메모리에 누적한다. 종료 전에도 브라우저 메모리에 남아 있지만, 새로고침하면 사라진다.

## 테스트와 검증

검증은 Chrome 수동 테스트를 중심으로 한다.

기본 시나리오는 일반 영어 콘텐츠 5분, 기술 웨비나 또는 강의 5분이다. 각 시나리오에서 한국어 음성 출력, 한국어 자막 누적, 지연 체감, 원본/번역 볼륨 조절, 종료 후 Markdown 다운로드를 확인한다.

오류 시나리오는 다음을 확인한다.

- 탭 오디오 공유 체크 누락.
- 사용자가 탭 공유 중단.
- 브라우저가 `suppressLocalAudioPlayback`을 지원하지 않아 원본 탭 소리가 직접 재생되는 경우.
- `OPENAI_API_KEY` 누락.
- OpenAI API 또는 네트워크 실패.

자동 종료 검증은 테스트용 상수 오버라이드로 수행한다. 120분 최대 세션은 짧은 시간으로 낮춰 cleanup과 종료 사유 기록을 확인한다. 30분 무음 종료도 테스트 모드에서는 짧은 시간으로 낮춰 검증한다. 운영 기본값과 테스트 기본값은 코드 상수로 분리한다.

## 다음 계획

PoC 검증 후 다음 계획으로 남길 항목은 다음과 같다.

- React 또는 Vite 기반 UI로 전환.
- 서버/클라이언트 모듈 분리.
- 영어 원문 transcript 표시 및 저장.
- transcript 후처리 요약과 전문용어 보정.
- DB 저장 및 세션 아카이브.
- EC2 배포, HTTPS, 외부 접속.
- Flutter 앱 통합.
- BlackHole 등 비브라우저 오디오 소스 캡처.

## 구현 범위 요약

이번 구현 계획은 `server.js`, `public/index.html`, `.env.example`, `package.json` 수준의 작은 Node/Express PoC를 대상으로 한다. 핵심은 실시간 통역 체감 품질과 안정적인 세션 정리이며, 앱 구조 확장은 후속 스펙에서 다룬다.
