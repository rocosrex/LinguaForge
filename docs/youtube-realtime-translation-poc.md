# YouTube 실시간 통역 PoC

영어 YouTube 라이브 → 실시간 한국어 통역 (음성 + 자막).
OpenAI Realtime Translation API + WebRTC + 브라우저 탭 오디오 캡처.

## 목표

- Chrome 탭에서 재생 중인 YouTube 영어 음성을 캡처
- OpenAI `gpt-realtime-translate` 세션에 실시간 송출
- 한국어 통역 음성을 헤드폰으로 듣고, 자막을 화면에 표시
- 지연 1~3초 (+ YouTube 라이브 자체 지연 5~15초)

## 사전 준비

이미 갖춘 것:
- OpenAI API key (Tier 5 — 한도 충분)
- Node.js (rocos-bridge)
- Chrome (탭 오디오 캡처 지원)

새로 셋업할 것:
- 프로젝트 디렉토리 1개
- 파일 2개 (`server.js`, `public/index.html`)
- `.env` 파일 1개

**HTTPS 불필요** — localhost는 브라우저 보안 정책상 HTTPS 없이도 `getDisplayMedia` 동작.

## 아키텍처

```
Chrome Tab 1: YouTube Live (영어 재생, 음소거 권장)
   │ 탭 오디오 캡처 (getDisplayMedia)
   ▼
Chrome Tab 2: localhost:3000 (통역 페이지)
   │ WebRTC peer connection
   ▼
api.openai.com/v1/realtime/translations
   │ 한국어 음성 + 자막 delta
   ▼
Chrome Tab 2: <audio> 재생 + 자막 표시
```

API key는 절대 브라우저로 안 내려감. `localhost:3000/session` 라우트가 OpenAI에서 단기 client_secret을 받아 브라우저에 전달.

## 1. 프로젝트 세팅

```bash
mkdir yt-translate-poc && cd yt-translate-poc
npm init -y
npm install express dotenv
mkdir public
```

`.env` 파일 생성:

```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
PORT=3000
```

## 2. server.js

```javascript
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.post("/session", async (req, res) => {
  const language = req.body.targetLanguage ?? "ko";

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/translations/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            model: "gpt-realtime-translate",
            audio: {
              output: { language },
            },
          },
        }),
      }
    );

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Translation PoC running at http://localhost:${PORT}`);
});
```

`package.json`에 `"type": "module"` 추가:

```json
{
  "type": "module",
  "scripts": {
    "start": "node server.js"
  }
}
```

## 3. public/index.html

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>YouTube Realtime Translation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      max-width: 900px;
      margin: 2rem auto;
      padding: 1rem;
      background: #1a1a1a;
      color: #f0f0f0;
    }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; }
    .controls {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    button {
      padding: 0.5rem 1rem;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
    }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    button.stop { background: #dc2626; }
    select { padding: 0.5rem; border-radius: 6px; }
    .status {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      background: #2a2a2a;
      font-size: 0.9rem;
    }
    .status.active { background: #064e3b; }
    .subtitles {
      background: #2a2a2a;
      border-radius: 8px;
      padding: 1.5rem;
      min-height: 200px;
      font-size: 1.5rem;
      line-height: 1.6;
      margin-top: 1rem;
      white-space: pre-wrap;
    }
    .source {
      color: #888;
      font-size: 1rem;
      margin-top: 1rem;
      padding: 1rem;
      background: #222;
      border-radius: 6px;
      max-height: 100px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <h1>YouTube Realtime Translation</h1>

  <div class="controls">
    <button id="startBtn">시작 (탭 선택)</button>
    <button id="stopBtn" class="stop" disabled>종료</button>
    <select id="lang">
      <option value="ko" selected>한국어</option>
      <option value="ja">일본어</option>
      <option value="zh">중국어</option>
      <option value="es">스페인어</option>
    </select>
    <span id="status" class="status">대기 중</span>
  </div>

  <audio id="translatedAudio" autoplay controls></audio>

  <div class="subtitles" id="subtitles">통역 자막이 여기 표시됩니다…</div>

  <div class="source" id="sourceTranscript">[원문 자막]</div>

<script>
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const langSelect = document.getElementById("lang");
const statusEl = document.getElementById("status");
const subtitles = document.getElementById("subtitles");
const sourceEl = document.getElementById("sourceTranscript");
const translatedAudio = document.getElementById("translatedAudio");

let pc = null;
let sourceStream = null;

function setStatus(msg, active = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("active", active);
}

startBtn.onclick = async () => {
  startBtn.disabled = true;
  setStatus("탭 오디오 요청 중...");

  try {
    sourceStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
      preferCurrentTab: false,
    });

    const audioTrack = sourceStream.getAudioTracks()[0];
    if (!audioTrack) {
      throw new Error("탭 오디오 공유 체크박스를 켜야 합니다.");
    }
    sourceStream.getVideoTracks().forEach((t) => t.stop());

    setStatus("세션 생성 중...");
    const sessionRes = await fetch("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLanguage: langSelect.value }),
    });
    const session = await sessionRes.json();
    const clientSecret = session.value;

    setStatus("WebRTC 연결 중...");
    pc = new RTCPeerConnection();
    pc.addTrack(audioTrack, sourceStream);

    pc.ontrack = ({ streams }) => {
      translatedAudio.srcObject = streams[0];
    };

    const events = pc.createDataChannel("oai-events");
    events.onmessage = ({ data }) => {
      const ev = JSON.parse(data);
      if (ev.type === "session.output_transcript.delta") {
        subtitles.textContent += ev.delta;
        subtitles.scrollTop = subtitles.scrollHeight;
      }
      if (ev.type === "session.input_transcript.delta") {
        sourceEl.textContent += ev.delta;
        sourceEl.scrollTop = sourceEl.scrollHeight;
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(
      "https://api.openai.com/v1/realtime/translations/calls",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      }
    );

    if (!sdpRes.ok) throw new Error(await sdpRes.text());

    await pc.setRemoteDescription({
      type: "answer",
      sdp: await sdpRes.text(),
    });

    subtitles.textContent = "";
    sourceEl.textContent = "";
    setStatus("통역 중", true);
    stopBtn.disabled = false;

    audioTrack.onended = () => stopSession();
  } catch (err) {
    console.error(err);
    setStatus("오류: " + err.message);
    startBtn.disabled = false;
  }
};

stopBtn.onclick = () => stopSession();

function stopSession() {
  if (pc) { pc.close(); pc = null; }
  if (sourceStream) {
    sourceStream.getTracks().forEach((t) => t.stop());
    sourceStream = null;
  }
  translatedAudio.srcObject = null;
  setStatus("종료됨");
  startBtn.disabled = false;
  stopBtn.disabled = true;
}
</script>
</body>
</html>
```

## 4. 실행 + 테스트

```bash
npm start
# Translation PoC running at http://localhost:3000
```

테스트 절차:
1. Chrome 탭 1: YouTube 영어 라이브 열기 (BBC News Live, TED Live, AI 컨퍼런스 라이브 등). 음소거 또는 볼륨 0%.
2. Chrome 탭 2: `http://localhost:3000` 열기.
3. "시작 (탭 선택)" 클릭 → 탭 선택 다이얼로그.
4. **YouTube 탭 선택** + **하단 "탭 오디오 공유" 체크박스 반드시 체크**.
5. 1~3초 후 한국어 통역 음성 들리고 자막 출력 시작.

## 5. 비용 모니터링

PoC 단계에서:
- **첫 5분 테스트** 후 platform.openai.com → Usage 페이지에서 실제 비용 확인.
- 분당 비용 = (5분 비용) ÷ 5. 1시간 비용 추정 가능.
- Tier 5라 한도 신경 쓸 필요 없지만 **Spending Limit**(Settings → Billing → Limits)을 월 $200 정도로 걸어두는 게 안전.

자동 종료 안 걸어둔 세션이 새벽까지 켜져 있으면 비용 폭주. 위 코드의 `audioTrack.onended` 핸들러는 탭이 닫히거나 공유가 끊기면 자동 종료. 추가로 30~90분 타이머를 setTimeout으로 거는 것도 고려.

## 6. 알려진 제약 / 함정

- **Safari 미지원**: `getDisplayMedia`의 오디오 트랙을 반환하지 않음. Chrome 또는 Edge.
- **"탭 오디오 공유" 체크박스 기본 OFF**: 매번 탭 선택 시 켜야 함.
- **광고 구간**: YouTube 광고 음성도 통역됨. 의미 없는 한국어 출력 가능. UI에 mute 토글 추가 권장.
- **고유명사**: Autodesk, ObjectARX 등 특수 용어는 음성 통역이 어색할 수 있음. 자막을 같이 보면서 보정.
- **저작권**: 본인 시청 한정. 통역 결과 재배포 불가.

## 7. 다음 단계 (PoC 검증 후)

1. **Glossary 주입**: 발표자 이름·전문용어를 `session.update`의 `instructions`로 미리 주입 → 품질 30~50% 향상. 웨비나/특정 채널 시청 시 필수.
2. **Transcript 자동 저장**: 양언어 transcript를 EC2 PostgreSQL에 누적. 종료 시 Markdown 회의록 자동 생성.
3. **Auto-stop 로직**: 30분 무음 자동 종료 + 90분 최대 세션 길이.
4. **EC2 배포 + HTTPS**: 외부 접근(폰에서도 보기) 필요 시 Tailscale Funnel 또는 도메인 + Nginx + certbot.
5. **Flutter 앱 통합**: Paperclip 결과 표시용 앱에 통역 화면 추가.
6. **BlackHole 옵션**: Zoom 데스크탑 앱 같은 비-브라우저 소스도 캡처 가능하게.
7. **Paperclip skill로 래핑**: Telegram 봇 명령어로 통역 시작/종료 + 자동 transcript 아카이브.

## 참고

- OpenAI Realtime Translation: https://developers.openai.com/api/docs/guides/realtime-translation
- Realtime WebRTC: https://developers.openai.com/api/docs/guides/realtime-webrtc
- Pricing: https://openai.com/api/pricing/
- Cost guide: https://developers.openai.com/api/docs/guides/realtime-costs
