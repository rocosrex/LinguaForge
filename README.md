# LinguaForge

Localhost proof of concept for live YouTube translation. LinguaForge captures audio from a Chrome tab, sends it to OpenAI Realtime Translation over WebRTC, plays translated audio, renders translated captions, and exports a Markdown transcript.

This repository is a PoC, not a production service. It is intentionally bound to loopback by default and keeps the OpenAI API key on the local server.

## What It Does

- Captures Chrome tab audio with `getDisplayMedia()`.
- Creates short-lived OpenAI Realtime Translation client secrets from a local Express server.
- Streams captured audio to `gpt-realtime-translate` over WebRTC.
- Plays translated audio in the browser.
- Shows translated captions.
- Provides original and translated audio volume controls.
- Supports manual stop, tab-ended stop, silence timeout, and max-session timeout.
- Exports the translated transcript as Markdown.

## Stack

- Node.js ESM
- Express
- Browser WebRTC APIs
- OpenAI Realtime Translation
- Chrome tab audio capture

## Quick Start

```bash
cd yt-translate-poc
npm install
cp .env.example .env
```

Edit `.env`:

```dotenv
OPENAI_API_KEY=sk-...
PORT=4000
HOST=127.0.0.1
```

Run:

```bash
npm start
```

Open:

```text
http://127.0.0.1:4000
```

In Chrome, click `Start`, select the YouTube tab, and make sure tab audio sharing is enabled.

## Security Notes

- `.env` is ignored and must not be committed.
- The server defaults to `127.0.0.1`.
- Unsafe bind hosts such as `0.0.0.0` are rejected.
- `/session` only accepts localhost Host/Origin values.
- The browser receives only a short-lived client secret, not the OpenAI API key.

## Verification Results

Latest automated test run:

```text
npm test
24 passed, 0 failed
```

Local smoke checks performed:

- Server started on `http://127.0.0.1:4000`.
- Static page loaded successfully.
- `/session` returned `200 OK` with a configured API key.
- Non-local Host was rejected with `403`.
- `HOST=0.0.0.0` was rejected before listen.
- Live browser translation was manually confirmed during PoC testing.

## Cost Note

The cost estimate is not reliable yet. During one rough manual run, the observed cost appeared to be around USD 10 for about 8 minutes, but the test was not isolated enough to publish that as a real benchmark. A controlled retest is needed before documenting expected cost per minute or per hour.

## Public Data Note

Raw YouTube transcript exports are intentionally not tracked in this public repository. The tracked comparison report in `test-output/` contains summarized evaluation notes rather than full source transcript dumps.

## Known Limitations

- `gpt-realtime-translate` currently uses dynamic voice adaptation, so translated voice color may shift during a session.
- Custom glossary, fixed voice selection, and custom prompting are not part of this PoC.
- Browser tests are source-contract tests; full WebRTC behavior still needs manual Chrome testing.
- Transcript export currently captures translated text only.

---

# LinguaForge 한국어

LinguaForge는 YouTube 영어 오디오를 실시간으로 한국어 통역하는 localhost PoC입니다. Chrome 탭 오디오를 캡처하고, OpenAI Realtime Translation에 WebRTC로 전송한 뒤, 브라우저에서 번역 음성 및 번역 자막을 제공합니다. 종료 후에는 번역 transcript를 Markdown으로 저장할 수 있습니다.

이 저장소는 운영 서비스가 아니라 PoC입니다. 기본적으로 loopback 주소에만 bind되며, OpenAI API key는 로컬 서버에만 보관합니다.

## 기능

- Chrome 탭 오디오 캡처
- 로컬 Express 서버에서 단기 OpenAI client secret 생성
- `gpt-realtime-translate` WebRTC 통역 세션 연결
- 번역 음성 재생
- 번역 자막 표시
- 원본/번역 볼륨 조절
- 수동 종료, 탭 종료 감지, 무음 종료, 최대 세션 시간 종료
- Markdown transcript 다운로드

## 실행 방법

```bash
cd yt-translate-poc
npm install
cp .env.example .env
```

`.env`를 수정합니다.

```dotenv
OPENAI_API_KEY=sk-...
PORT=4000
HOST=127.0.0.1
```

실행:

```bash
npm start
```

브라우저에서 엽니다.

```text
http://127.0.0.1:4000
```

Chrome에서 `Start`를 누르고 YouTube 탭을 선택한 뒤, 탭 오디오 공유를 반드시 켜야 합니다.

## 보안 메모

- `.env`는 git에서 ignore됩니다.
- 서버는 기본적으로 `127.0.0.1`에서만 실행됩니다.
- `0.0.0.0` 같은 unsafe bind host는 차단됩니다.
- `/session`은 localhost Host/Origin만 허용합니다.
- 브라우저에는 OpenAI API key가 내려가지 않고, 단기 client secret만 전달됩니다.

## 테스트 결과

최근 자동 테스트 결과:

```text
npm test
24 passed, 0 failed
```

로컬 smoke check:

- `http://127.0.0.1:4000`에서 서버 기동 확인
- 정적 페이지 로딩 확인
- API key 설정 후 `/session` 200 응답 확인
- non-local Host 요청 403 차단 확인
- `HOST=0.0.0.0` 실행 전 차단 확인
- 브라우저 실시간 통역 동작은 PoC 테스트 중 수동 확인

## 비용 메모

비용 추정은 아직 정확하지 않습니다. 한 번의 거친 수동 테스트에서 약 8분에 USD 10 정도로 보였지만, 해당 테스트는 비용을 분리해 측정한 것이 아니라 신뢰할 수 있는 벤치마크로 쓰면 안 됩니다. 분당/시간당 비용은 별도의 통제된 재테스트 후 문서화해야 합니다.

## 공개 데이터 메모

YouTube transcript 전문은 public 저장소에 추적하지 않습니다. `test-output/`에는 전체 원문 transcript가 아니라 요약된 비교/평가 리포트만 남깁니다.

## 알려진 제약

- `gpt-realtime-translate`는 dynamic voice adaptation 방식이라 통역 음색이 세션 중 바뀔 수 있습니다.
- glossary, 고정 음성 선택, custom prompting은 이번 PoC 범위가 아닙니다.
- 브라우저 테스트는 소스 계약 테스트 중심이며, WebRTC 전체 동작은 Chrome에서 수동 확인이 필요합니다.
- 현재 transcript export는 번역문만 저장합니다.
