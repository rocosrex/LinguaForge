# YouTube Realtime Translation PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hardened localhost PoC that captures YouTube tab audio in Chrome, streams it to OpenAI Realtime Translation over WebRTC, plays Korean translated audio, shows Korean captions, and downloads a Markdown transcript after the session ends.

**Architecture:** Create a small `yt-translate-poc/` Node + Express app. The server only serves static files and creates short-lived OpenAI Realtime Translation client secrets. The browser owns tab capture, WebRTC connection setup, audio mixing controls, caption rendering, auto-stop timers, and Markdown download.

**Tech Stack:** Node.js ESM, Express, dotenv, Node built-in test runner, browser WebRTC APIs, Chrome `getDisplayMedia()`, OpenAI `gpt-realtime-translate`.

---

## Source Spec

- Design: `docs/superpowers/specs/2026-05-10-youtube-realtime-translation-poc-design.md`
- Original PoC note: `docs/youtube-realtime-translation-poc.md`
- Official docs checked during planning:
  - `https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide`
  - `https://developers.openai.com/api/docs/guides/realtime-translation`
  - `https://developers.openai.com/api/docs/guides/realtime-costs`
  - `https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia`

## File Structure

- Create: `yt-translate-poc/package.json`
  - Owns Node package metadata, scripts, runtime dependencies, and Node version requirement.
- Create: `yt-translate-poc/.env.example`
  - Documents required environment variables without storing secrets.
- Create: `yt-translate-poc/server.js`
  - Owns Express app creation, language validation, `/session` route, OpenAI client-secret request, static file serving, and local server startup.
- Create: `yt-translate-poc/public/index.html`
  - Owns all UI, browser state, tab capture, WebRTC setup, audio controls, captions, auto-stop logic, and Markdown download.
- Create: `yt-translate-poc/test/server.test.js`
  - Tests language validation, API key handling, upstream request payloads, and upstream failure behavior.
- Create: `yt-translate-poc/test/index-html.test.js`
  - Tests that the single HTML file exposes required controls and includes critical browser integration hooks.

## Task 1: Scaffold the PoC App

**Files:**
- Create: `yt-translate-poc/package.json`
- Create: `yt-translate-poc/.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `yt-translate-poc/package.json`**

Create `yt-translate-poc/package.json` with this content:

```json
{
  "name": "yt-translate-poc",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Localhost YouTube realtime translation PoC using OpenAI Realtime Translation over WebRTC.",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "dotenv": "^16.4.7",
    "express": "^4.21.2"
  }
}
```

- [ ] **Step 2: Create `yt-translate-poc/.env.example`**

Create `yt-translate-poc/.env.example` with this content:

```dotenv
OPENAI_API_KEY=
PORT=3000
```

- [ ] **Step 3: Confirm `.gitignore` protects local runtime files**

Ensure `.gitignore` contains these lines:

```gitignore
.DS_Store
node_modules/
.env
```

- [ ] **Step 4: Install dependencies and generate the lockfile**

Run:

```bash
cd yt-translate-poc
npm install
```

Expected: `node_modules/` is created locally, `package-lock.json` is generated, and npm exits with code 0.

- [ ] **Step 5: Run the empty test suite**

Run:

```bash
cd yt-translate-poc
npm test
```

Expected: Node reports zero test files or zero tests and exits with code 0.

- [ ] **Step 6: Commit the scaffold**

Run:

```bash
git add .gitignore yt-translate-poc/package.json yt-translate-poc/package-lock.json yt-translate-poc/.env.example
git commit -m "chore: scaffold translation poc app"
```

Expected: commit succeeds.

## Task 2: Add the Express Session Server

**Files:**
- Create: `yt-translate-poc/test/server.test.js`
- Create: `yt-translate-poc/server.js`

- [ ] **Step 1: Write failing server tests**

Create `yt-translate-poc/test/server.test.js` with this content:

```js
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  OPENAI_TRANSLATION_CLIENT_SECRETS_URL,
  createApp,
  normalizeTargetLanguage,
} from "../server.js";

function requestJson(app, { method = "POST", path = "/session", body } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const headers = payload
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          }
        : {};

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path,
          method,
          headers,
        },
        (res) => {
          let raw = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            raw += chunk;
          });
          res.on("end", () => {
            server.close(() => {
              resolve({
                status: res.statusCode,
                body: raw ? JSON.parse(raw) : undefined,
              });
            });
          });
        }
      );

      req.on("error", (error) => {
        server.close(() => reject(error));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });
}

test("normalizeTargetLanguage defaults to Korean", () => {
  assert.equal(normalizeTargetLanguage(undefined), "ko");
  assert.equal(normalizeTargetLanguage(""), "ko");
  assert.equal(normalizeTargetLanguage("  ko  "), "ko");
});

test("normalizeTargetLanguage rejects unsupported languages", () => {
  assert.throws(
    () => normalizeTargetLanguage("fr"),
    /Unsupported targetLanguage: fr/
  );
});

test("POST /session returns a short-lived OpenAI client secret", async () => {
  let capturedRequest;
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async (url, init) => {
      capturedRequest = {
        url,
        method: init.method,
        headers: init.headers,
        body: JSON.parse(init.body),
      };

      return Response.json({
        value: "client-secret-test",
        expires_at: 1234567890,
      });
    },
  });

  const response = await requestJson(app, {
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    value: "client-secret-test",
    expires_at: 1234567890,
  });
  assert.equal(capturedRequest.url, OPENAI_TRANSLATION_CLIENT_SECRETS_URL);
  assert.equal(capturedRequest.method, "POST");
  assert.equal(capturedRequest.headers.Authorization, "Bearer sk-test");
  assert.equal(capturedRequest.headers["Content-Type"], "application/json");
  assert.deepEqual(capturedRequest.body, {
    session: {
      model: "gpt-realtime-translate",
      audio: {
        output: {
          language: "ko",
        },
      },
    },
  });
});

test("POST /session rejects unsupported target languages before calling OpenAI", async () => {
  let fetchCalled = false;
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () => {
      fetchCalled = true;
      return Response.json({});
    },
  });

  const response = await requestJson(app, {
    body: {
      targetLanguage: "fr",
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Unsupported targetLanguage: fr");
  assert.equal(fetchCalled, false);
});

test("POST /session fails clearly when OPENAI_API_KEY is missing", async () => {
  const app = createApp({
    apiKey: "",
    fetchImpl: async () => Response.json({}),
  });

  const response = await requestJson(app, {
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 500);
  assert.equal(response.body.error, "OPENAI_API_KEY is not configured");
});

test("POST /session forwards OpenAI error status and message", async () => {
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () =>
      Response.json(
        {
          error: {
            message: "Invalid API key",
          },
        },
        {
          status: 401,
        }
      ),
  });

  const response = await requestJson(app, {
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Invalid API key");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd yt-translate-poc
npm test
```

Expected: FAIL because `server.js` does not exist.

- [ ] **Step 3: Implement `server.js`**

Create `yt-translate-poc/server.js` with this content:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import express from "express";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const OPENAI_TRANSLATION_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/translations/client_secrets";

const ALLOWED_TARGET_LANGUAGES = new Set(["ko", "ja", "zh", "es"]);

export function normalizeTargetLanguage(value) {
  const language = typeof value === "string" ? value.trim() : "";
  const targetLanguage = language || "ko";

  if (!ALLOWED_TARGET_LANGUAGES.has(targetLanguage)) {
    const error = new Error(`Unsupported targetLanguage: ${targetLanguage}`);
    error.statusCode = 400;
    throw error;
  }

  return targetLanguage;
}

function extractClientSecretPayload(data) {
  if (typeof data?.value === "string") {
    return data;
  }

  if (typeof data?.client_secret?.value === "string") {
    return {
      value: data.client_secret.value,
      expires_at: data.client_secret.expires_at,
    };
  }

  return data;
}

export function createApp({
  apiKey = process.env.OPENAI_API_KEY,
  fetchImpl = globalThis.fetch,
  staticDir = path.join(__dirname, "public"),
} = {}) {
  const app = express();

  app.use(express.json({ limit: "16kb" }));
  app.use(express.static(staticDir));

  app.post("/session", async (req, res) => {
    let targetLanguage;

    try {
      targetLanguage = normalizeTargetLanguage(req.body?.targetLanguage);
    } catch (error) {
      return res.status(error.statusCode ?? 400).json({
        error: error.message,
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured",
      });
    }

    try {
      const response = await fetchImpl(OPENAI_TRANSLATION_CLIENT_SECRETS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            model: "gpt-realtime-translate",
            audio: {
              output: {
                language: targetLanguage,
              },
            },
          },
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return res.status(response.status).json({
          error: data?.error?.message ?? "OpenAI session creation failed",
          details: data,
        });
      }

      return res.status(200).json(extractClientSecretPayload(data));
    } catch (error) {
      console.error("Failed to create translation session", error);
      return res.status(502).json({
        error: "Failed to create OpenAI translation session",
      });
    }
  });

  return app;
}

if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp();

  app.listen(port, () => {
    console.log(`Translation PoC running at http://localhost:${port}`);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd yt-translate-poc
npm test
```

Expected: PASS for all `server.test.js` tests.

- [ ] **Step 5: Commit the server**

Run:

```bash
git add yt-translate-poc/server.js yt-translate-poc/test/server.test.js
git commit -m "feat: add translation session server"
```

Expected: commit succeeds.

## Task 3: Add the UI Shell

**Files:**
- Create: `yt-translate-poc/test/index-html.test.js`
- Create: `yt-translate-poc/public/index.html`

- [ ] **Step 1: Write failing HTML contract tests**

Create `yt-translate-poc/test/index-html.test.js` with this content:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../public/index.html", import.meta.url);

async function readIndexHtml() {
  return readFile(htmlPath, "utf8");
}

test("index page exposes required controls", async () => {
  const html = await readIndexHtml();
  const requiredIds = [
    "startBtn",
    "stopBtn",
    "downloadBtn",
    "lang",
    "status",
    "elapsed",
    "originalVolume",
    "translatedVolume",
    "subtitles",
    "originalAudio",
    "translatedAudio",
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd yt-translate-poc
npm test
```

Expected: FAIL because `public/index.html` does not exist.

- [ ] **Step 3: Implement the static UI shell**

Create `yt-translate-poc/public/index.html` with this content:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YouTube Realtime Translation</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #111827;
      --panel: #1f2937;
      --panel-2: #263241;
      --text: #f9fafb;
      --muted: #a7b0bf;
      --line: #374151;
      --accent: #14b8a6;
      --accent-strong: #0f766e;
      --danger: #ef4444;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      width: min(960px, calc(100% - 32px));
      margin: 0 auto;
      padding: 24px 0 40px;
    }

    h1 {
      margin: 0 0 20px;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .toolbar,
    .audio-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }

    .audio-controls {
      margin-top: 12px;
    }

    button,
    select {
      height: 40px;
      border-radius: 6px;
      border: 1px solid var(--line);
      font: inherit;
    }

    button {
      padding: 0 14px;
      border-color: transparent;
      background: var(--accent);
      color: #05201d;
      font-weight: 700;
      cursor: pointer;
    }

    button.stop {
      background: var(--danger);
      color: white;
    }

    button.secondary {
      background: var(--panel-2);
      color: var(--text);
      border-color: var(--line);
    }

    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    select {
      padding: 0 10px;
      background: var(--panel-2);
      color: var(--text);
    }

    .status,
    .elapsed {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      border-radius: 6px;
      background: var(--panel-2);
      color: var(--muted);
      font-size: 14px;
    }

    label {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      color: var(--muted);
      font-size: 14px;
    }

    input[type="range"] {
      width: 160px;
      accent-color: var(--accent);
    }

    .subtitles {
      margin-top: 16px;
      min-height: 320px;
      max-height: 58vh;
      overflow-y: auto;
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0f172a;
      font-size: 28px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    audio {
      width: 100%;
      margin-top: 12px;
    }

    @media (max-width: 640px) {
      main {
        width: min(100% - 20px, 960px);
        padding-top: 16px;
      }

      .toolbar,
      .audio-controls {
        align-items: stretch;
      }

      button,
      select,
      .status,
      .elapsed,
      label {
        width: 100%;
      }

      input[type="range"] {
        flex: 1;
        width: auto;
      }

      .subtitles {
        min-height: 280px;
        font-size: 22px;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>YouTube Realtime Translation</h1>

    <section class="toolbar" aria-label="세션 컨트롤">
      <button id="startBtn" type="button">시작</button>
      <button id="stopBtn" class="stop" type="button" disabled>종료</button>
      <button id="downloadBtn" class="secondary" type="button" disabled>Markdown 다운로드</button>
      <select id="lang" aria-label="대상 언어">
        <option value="ko" selected>한국어</option>
        <option value="ja">일본어</option>
        <option value="zh">중국어</option>
        <option value="es">스페인어</option>
      </select>
      <span id="status" class="status">대기 중</span>
      <span id="elapsed" class="elapsed">00:00</span>
    </section>

    <section class="audio-controls" aria-label="오디오 믹스">
      <label for="originalVolume">
        원본
        <input id="originalVolume" type="range" min="0" max="1" step="0.01" value="0.08">
      </label>
      <label for="translatedVolume">
        번역
        <input id="translatedVolume" type="range" min="0" max="1" step="0.01" value="1">
      </label>
    </section>

    <audio id="originalAudio" autoplay></audio>
    <audio id="translatedAudio" autoplay controls></audio>

    <section id="subtitles" class="subtitles" aria-live="polite">
      한국어 자막이 여기에 표시됩니다.
    </section>
  </main>

  <script>
    document.getElementById("status").textContent =
      "시작 버튼을 누른 뒤 YouTube 탭과 탭 오디오 공유를 선택하세요.";
  </script>
</body>
</html>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd yt-translate-poc
npm test
```

Expected: PASS for server tests and HTML contract test.

- [ ] **Step 5: Commit the UI shell**

Run:

```bash
git add yt-translate-poc/public/index.html yt-translate-poc/test/index-html.test.js
git commit -m "feat: add translation poc ui shell"
```

Expected: commit succeeds.

## Task 4: Add Browser Capture, WebRTC, Captions, Timers, and Download

**Files:**
- Modify: `yt-translate-poc/test/index-html.test.js`
- Modify: `yt-translate-poc/public/index.html`

- [ ] **Step 1: Extend the HTML contract tests**

Replace `yt-translate-poc/test/index-html.test.js` with this content:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../public/index.html", import.meta.url);

async function readIndexHtml() {
  return readFile(htmlPath, "utf8");
}

test("index page exposes required controls", async () => {
  const html = await readIndexHtml();
  const requiredIds = [
    "startBtn",
    "stopBtn",
    "downloadBtn",
    "lang",
    "status",
    "elapsed",
    "originalVolume",
    "translatedVolume",
    "subtitles",
    "originalAudio",
    "translatedAudio",
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("index page includes realtime translation client hooks", async () => {
  const html = await readIndexHtml();
  const requiredTokens = [
    "suppressLocalAudioPlayback",
    "RTCPeerConnection",
    "createDataChannel(\"oai-events\")",
    "realtime/translations/calls",
    "SILENCE_TIMEOUT_MS",
    "MAX_SESSION_MS",
    "downloadMarkdown",
    "startSilenceMonitor",
    "stopSession",
  ];

  for (const token of requiredTokens) {
    assert.match(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run:

```bash
cd yt-translate-poc
npm test
```

Expected: FAIL because the static shell does not yet include WebRTC, timers, or Markdown download logic.

- [ ] **Step 3: Replace `public/index.html` with the working client**

Replace `yt-translate-poc/public/index.html` with this content:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YouTube Realtime Translation</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #111827;
      --panel: #1f2937;
      --panel-2: #263241;
      --text: #f9fafb;
      --muted: #a7b0bf;
      --line: #374151;
      --accent: #14b8a6;
      --danger: #ef4444;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      width: min(960px, calc(100% - 32px));
      margin: 0 auto;
      padding: 24px 0 40px;
    }

    h1 {
      margin: 0 0 20px;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0;
    }

    .toolbar,
    .audio-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }

    .audio-controls {
      margin-top: 12px;
    }

    button,
    select {
      height: 40px;
      border-radius: 6px;
      border: 1px solid var(--line);
      font: inherit;
    }

    button {
      padding: 0 14px;
      border-color: transparent;
      background: var(--accent);
      color: #05201d;
      font-weight: 700;
      cursor: pointer;
    }

    button.stop {
      background: var(--danger);
      color: white;
    }

    button.secondary {
      background: var(--panel-2);
      color: var(--text);
      border-color: var(--line);
    }

    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    select {
      padding: 0 10px;
      background: var(--panel-2);
      color: var(--text);
    }

    .status,
    .elapsed {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      border-radius: 6px;
      background: var(--panel-2);
      color: var(--muted);
      font-size: 14px;
    }

    .status.active {
      color: #ccfbf1;
      background: #115e59;
    }

    .status.error {
      color: white;
      background: #991b1b;
    }

    label {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      color: var(--muted);
      font-size: 14px;
    }

    input[type="range"] {
      width: 160px;
      accent-color: var(--accent);
    }

    .subtitles {
      margin-top: 16px;
      min-height: 320px;
      max-height: 58vh;
      overflow-y: auto;
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #0f172a;
      font-size: 28px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    audio {
      width: 100%;
      margin-top: 12px;
    }

    @media (max-width: 640px) {
      main {
        width: min(100% - 20px, 960px);
        padding-top: 16px;
      }

      .toolbar,
      .audio-controls {
        align-items: stretch;
      }

      button,
      select,
      .status,
      .elapsed,
      label {
        width: 100%;
      }

      input[type="range"] {
        flex: 1;
        width: auto;
      }

      .subtitles {
        min-height: 280px;
        font-size: 22px;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>YouTube Realtime Translation</h1>

    <section class="toolbar" aria-label="세션 컨트롤">
      <button id="startBtn" type="button">시작</button>
      <button id="stopBtn" class="stop" type="button" disabled>종료</button>
      <button id="downloadBtn" class="secondary" type="button" disabled>Markdown 다운로드</button>
      <select id="lang" aria-label="대상 언어">
        <option value="ko" selected>한국어</option>
        <option value="ja">일본어</option>
        <option value="zh">중국어</option>
        <option value="es">스페인어</option>
      </select>
      <span id="status" class="status">대기 중</span>
      <span id="elapsed" class="elapsed">00:00</span>
    </section>

    <section class="audio-controls" aria-label="오디오 믹스">
      <label for="originalVolume">
        원본
        <input id="originalVolume" type="range" min="0" max="1" step="0.01" value="0.08">
      </label>
      <label for="translatedVolume">
        번역
        <input id="translatedVolume" type="range" min="0" max="1" step="0.01" value="1">
      </label>
    </section>

    <audio id="originalAudio" autoplay></audio>
    <audio id="translatedAudio" autoplay controls></audio>

    <section id="subtitles" class="subtitles" aria-live="polite">
      한국어 자막이 여기에 표시됩니다.
    </section>
  </main>

  <script>
    const OPENAI_TRANSLATION_CALL_URL =
      "https://api.openai.com/v1/realtime/translations/calls";
    const TEST_MODE = new URLSearchParams(window.location.search).get("testMode") === "1";
    const MAX_SESSION_MS = TEST_MODE ? 15000 : 120 * 60 * 1000;
    const SILENCE_TIMEOUT_MS = TEST_MODE ? 5000 : 30 * 60 * 1000;
    const SILENCE_CHECK_INTERVAL_MS = 1000;
    const SILENCE_RMS_THRESHOLD = 0.012;

    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const langSelect = document.getElementById("lang");
    const statusEl = document.getElementById("status");
    const elapsedEl = document.getElementById("elapsed");
    const originalVolume = document.getElementById("originalVolume");
    const translatedVolume = document.getElementById("translatedVolume");
    const subtitles = document.getElementById("subtitles");
    const originalAudio = document.getElementById("originalAudio");
    const translatedAudio = document.getElementById("translatedAudio");

    const session = {
      pc: null,
      events: null,
      sourceStream: null,
      audioContext: null,
      analyser: null,
      analyserBuffer: null,
      elapsedInterval: null,
      maxSessionTimer: null,
      silenceInterval: null,
      lastSoundAt: null,
      startTime: null,
      endTime: null,
      endReason: null,
      transcript: "",
      state: "idle",
    };

    function setStatus(message, { active = false, error = false } = {}) {
      statusEl.textContent = message;
      statusEl.classList.toggle("active", active);
      statusEl.classList.toggle("error", error);
    }

    function setState(nextState, message) {
      session.state = nextState;
      startBtn.disabled = !["idle", "ended", "error"].includes(nextState);
      stopBtn.disabled = nextState !== "translating";
      langSelect.disabled = !["idle", "ended", "error"].includes(nextState);
      downloadBtn.disabled = session.transcript.trim().length === 0;

      setStatus(message, {
        active: nextState === "translating",
        error: nextState === "error",
      });
    }

    function formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (hours > 0) {
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      }

      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    function updateElapsed() {
      if (!session.startTime) {
        elapsedEl.textContent = "00:00";
        return;
      }

      const end = session.endTime ?? new Date();
      elapsedEl.textContent = formatDuration(end.getTime() - session.startTime.getTime());
    }

    function setAudioVolumes() {
      originalAudio.volume = Number(originalVolume.value);
      translatedAudio.volume = Number(translatedVolume.value);
    }

    function appendCaption(delta) {
      if (!delta) {
        return;
      }

      session.transcript += delta;
      subtitles.textContent = session.transcript;
      subtitles.scrollTop = subtitles.scrollHeight;
      downloadBtn.disabled = session.transcript.trim().length === 0;
    }

    function extractTranscriptDelta(event) {
      if (typeof event?.delta === "string" && event.type?.includes("output_transcript")) {
        return event.delta;
      }

      if (typeof event?.delta === "string" && event.type?.includes("transcript.delta")) {
        return event.delta;
      }

      if (typeof event?.text === "string" && event.type?.includes("output_transcript")) {
        return event.text;
      }

      return "";
    }

    function handleRealtimeEvent(rawData) {
      try {
        const event = JSON.parse(rawData);

        if (event.type?.includes("error")) {
          console.error("Realtime Translation event error", event);
          return;
        }

        appendCaption(extractTranscriptDelta(event));
      } catch (error) {
        console.error("Failed to parse realtime event", error, rawData);
      }
    }

    async function captureTabAudio() {
      const preferredOptions = {
        video: true,
        audio: {
          suppressLocalAudioPlayback: true,
        },
        preferCurrentTab: false,
      };

      try {
        return await navigator.mediaDevices.getDisplayMedia(preferredOptions);
      } catch (error) {
        if (error instanceof TypeError) {
          return navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
            preferCurrentTab: false,
          });
        }

        throw error;
      }
    }

    async function createClientSecret(targetLanguage) {
      const response = await fetch("/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetLanguage }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "세션 생성에 실패했습니다.");
      }

      const clientSecret = data.value ?? data.client_secret?.value;
      if (!clientSecret) {
        throw new Error("OpenAI client secret 응답이 비어 있습니다.");
      }

      return clientSecret;
    }

    async function connectWebRtc(audioTrack, stream, clientSecret) {
      const pc = new RTCPeerConnection();
      session.pc = pc;

      pc.addTrack(audioTrack, stream);
      session.events = pc.createDataChannel("oai-events");
      session.events.onmessage = ({ data }) => handleRealtimeEvent(data);

      pc.ontrack = ({ streams }) => {
        translatedAudio.srcObject = streams[0];
        translatedAudio.play().catch(() => {});
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch(OPENAI_TRANSLATION_CALL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await pc.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
    }

    function startElapsedTimer() {
      clearInterval(session.elapsedInterval);
      session.elapsedInterval = setInterval(updateElapsed, 1000);
      updateElapsed();
    }

    function startMaxSessionTimer() {
      clearTimeout(session.maxSessionTimer);
      session.maxSessionTimer = setTimeout(() => {
        stopSession("max-session-time");
      }, MAX_SESSION_MS);
    }

    function startSilenceMonitor(audioTrack) {
      const audioStream = new MediaStream([audioTrack]);
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;

      if (!AudioContextClass) {
        console.warn("AudioContext is unavailable; silence timeout is disabled.");
        return;
      }

      session.audioContext = new AudioContextClass();
      const source = session.audioContext.createMediaStreamSource(audioStream);
      session.analyser = session.audioContext.createAnalyser();
      session.analyser.fftSize = 2048;
      source.connect(session.analyser);
      session.analyserBuffer = new Uint8Array(session.analyser.fftSize);
      session.lastSoundAt = Date.now();

      clearInterval(session.silenceInterval);
      session.silenceInterval = setInterval(() => {
        session.analyser.getByteTimeDomainData(session.analyserBuffer);

        let sum = 0;
        for (const value of session.analyserBuffer) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / session.analyserBuffer.length);
        if (rms > SILENCE_RMS_THRESHOLD) {
          session.lastSoundAt = Date.now();
          return;
        }

        if (Date.now() - session.lastSoundAt >= SILENCE_TIMEOUT_MS) {
          stopSession("silence-timeout");
        }
      }, SILENCE_CHECK_INTERVAL_MS);
    }

    function cleanupResources() {
      clearInterval(session.elapsedInterval);
      clearInterval(session.silenceInterval);
      clearTimeout(session.maxSessionTimer);
      session.elapsedInterval = null;
      session.silenceInterval = null;
      session.maxSessionTimer = null;

      if (session.events) {
        session.events.close();
        session.events = null;
      }

      if (session.pc) {
        session.pc.close();
        session.pc = null;
      }

      if (session.sourceStream) {
        session.sourceStream.getTracks().forEach((track) => track.stop());
        session.sourceStream = null;
      }

      if (session.audioContext) {
        session.audioContext.close().catch(() => {});
        session.audioContext = null;
      }

      session.analyser = null;
      session.analyserBuffer = null;
      originalAudio.srcObject = null;
      translatedAudio.srcObject = null;
    }

    function reasonLabel(reason) {
      const labels = {
        manual: "수동 종료",
        "silence-timeout": "30분 무음 종료",
        "max-session-time": "120분 최대 세션 종료",
        "tab-ended": "탭 공유 종료",
        error: "오류 종료",
      };

      return labels[reason] ?? reason;
    }

    function stopSession(reason = "manual") {
      if (["idle", "ended"].includes(session.state)) {
        return;
      }

      session.endTime = new Date();
      session.endReason = reason;
      cleanupResources();
      updateElapsed();
      setState("ended", reasonLabel(reason));
    }

    async function startSession() {
      setAudioVolumes();
      session.transcript = "";
      session.startTime = null;
      session.endTime = null;
      session.endReason = null;
      subtitles.textContent = "";
      downloadBtn.disabled = true;

      try {
        setState("requesting-capture", "탭 오디오 요청 중");
        const captureStream = await captureTabAudio();
        const audioTrack = captureStream.getAudioTracks()[0];

        if (!audioTrack) {
          captureStream.getTracks().forEach((track) => track.stop());
          throw new Error("Chrome 공유 창에서 탭 오디오 공유를 체크해야 합니다.");
        }

        captureStream.getVideoTracks().forEach((track) => track.stop());
        const audioOnlyStream = new MediaStream([audioTrack]);
        session.sourceStream = audioOnlyStream;
        originalAudio.srcObject = audioOnlyStream;
        originalAudio.play().catch(() => {});
        audioTrack.onended = () => stopSession("tab-ended");

        setState("creating-session", "OpenAI 세션 생성 중");
        const clientSecret = await createClientSecret(langSelect.value);

        setState("connecting", "WebRTC 연결 중");
        await connectWebRtc(audioTrack, audioOnlyStream, clientSecret);

        session.startTime = new Date();
        startElapsedTimer();
        startMaxSessionTimer();
        startSilenceMonitor(audioTrack);
        setState("translating", "통역 중");
      } catch (error) {
        console.error(error);
        session.endTime = new Date();
        session.endReason = "error";
        cleanupResources();
        updateElapsed();
        setState("error", `오류: ${error.message}`);
      }
    }

    function formatLocalTimestamp(date) {
      const offsetMs = date.getTimezoneOffset() * 60 * 1000;
      return new Date(date.getTime() - offsetMs).toISOString().slice(0, 19);
    }

    function buildMarkdown() {
      const started = session.startTime ?? new Date();
      const ended = session.endTime ?? new Date();
      const duration = formatDuration(ended.getTime() - started.getTime());
      const reason = session.endReason ?? "manual";
      const transcript = session.transcript.trim() || "자막 내용이 없습니다.";

      return [
        "# YouTube Translation Session",
        "",
        `- Started: ${formatLocalTimestamp(started)}`,
        `- Ended: ${formatLocalTimestamp(ended)}`,
        `- Duration: ${duration}`,
        `- Target language: ${langSelect.value}`,
        `- End reason: ${reason}`,
        "",
        "## Korean Transcript",
        "",
        transcript,
        "",
      ].join("\n");
    }

    function downloadMarkdown() {
      const markdown = buildMarkdown();
      const timestamp = formatLocalTimestamp(session.startTime ?? new Date())
        .replaceAll("-", "")
        .replace("T", "-")
        .replaceAll(":", "")
        .slice(0, 13);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `youtube-translation-${timestamp}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    startBtn.addEventListener("click", startSession);
    stopBtn.addEventListener("click", () => stopSession("manual"));
    downloadBtn.addEventListener("click", downloadMarkdown);
    originalVolume.addEventListener("input", setAudioVolumes);
    translatedVolume.addEventListener("input", setAudioVolumes);

    setAudioVolumes();
    setState(
      "idle",
      "시작 버튼을 누른 뒤 YouTube 탭과 탭 오디오 공유를 선택하세요."
    );
  </script>
</body>
</html>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd yt-translate-poc
npm test
```

Expected: PASS for server tests and HTML contract tests.

- [ ] **Step 5: Commit the browser client**

Run:

```bash
git add yt-translate-poc/public/index.html yt-translate-poc/test/index-html.test.js
git commit -m "feat: add realtime translation browser client"
```

Expected: commit succeeds.

## Task 5: Run Local Smoke Tests

**Files:**
- Verify: `yt-translate-poc/server.js`
- Verify: `yt-translate-poc/public/index.html`

- [ ] **Step 1: Create a local `.env`**

Create `yt-translate-poc/.env` with this shape and put a real OpenAI API key in `OPENAI_API_KEY`:

```dotenv
OPENAI_API_KEY=
PORT=3000
```

Expected: `.env` remains untracked because root `.gitignore` ignores `.env`.

- [ ] **Step 2: Start the local server**

Run:

```bash
cd yt-translate-poc
npm start
```

Expected output:

```text
Translation PoC running at http://localhost:3000
```

- [ ] **Step 3: Verify static loading**

Open:

```text
http://localhost:3000
```

Expected: the page shows start, stop, download, language selector, status, elapsed time, original volume, translated volume, translated audio controls, and a large Korean subtitle area.

- [ ] **Step 4: Verify the missing audio-share error**

In Chrome, click `시작`, choose a tab without enabling tab audio sharing, then confirm the capture.

Expected: the app shows `오류: Chrome 공유 창에서 탭 오디오 공유를 체크해야 합니다.` and the `시작` button becomes available again.

- [ ] **Step 5: Verify a 5-minute general English session**

In Chrome, open an English news or interview video in another tab. In the PoC page, click `시작`, choose the YouTube tab, enable tab audio sharing, and listen for 5 minutes.

Expected:
- Korean translated audio plays from the PoC page.
- Korean captions accumulate in the large subtitle area.
- The elapsed timer increments.
- Original and translated volume sliders change the perceived mix.
- Clicking `종료` stops the session and enables Markdown download.

- [ ] **Step 6: Verify a 5-minute technical English session**

Repeat Step 5 with a technical webinar, lecture, or product talk.

Expected:
- Korean translated audio and captions still work.
- Technical terms may be imperfect because glossary and custom instructions are intentionally outside this PoC.
- Manual notes about latency and term quality can be added outside the app.

- [ ] **Step 7: Verify Markdown download**

After stopping a session, click `Markdown 다운로드`.

Expected: Chrome downloads a file named like `youtube-translation-20260510-0130.md`. The file contains session metadata and the Korean transcript.

- [ ] **Step 8: Verify test-mode timeouts**

Open:

```text
http://localhost:3000?testMode=1
```

Start a session with tab audio. Let it run until the shortened max-session timer fires.

Expected: the app stops with `120분 최대 세션 종료` after about 15 seconds in test mode. If the captured source is silent, the app stops with `30분 무음 종료` after about 5 seconds in test mode.

- [ ] **Step 9: Stop the server**

Press `Ctrl+C` in the terminal running `npm start`.

Expected: server exits cleanly.

## Task 6: Final Verification and Commit Check

**Files:**
- Verify: all files under `yt-translate-poc/`

- [ ] **Step 1: Run automated tests**

Run:

```bash
cd yt-translate-poc
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Check git status**

Run:

```bash
git status --short
```

Expected: no unexpected untracked files except local `yt-translate-poc/.env` and `yt-translate-poc/node_modules/`, both ignored by `.gitignore`.

- [ ] **Step 3: Confirm recent commits**

Run:

```bash
git log --oneline -5
```

Expected: recent commits include:

```text
feat: add realtime translation browser client
feat: add translation poc ui shell
feat: add translation session server
chore: scaffold translation poc app
docs: add realtime translation poc design
```

## Self-Review

Spec coverage:
- Chrome tab capture: Task 4 implements `getDisplayMedia()` with tab-audio fallback handling.
- OpenAI WebRTC Translation: Task 2 creates client secrets; Task 4 posts SDP offers to the Translation call endpoint.
- Korean audio and captions: Task 4 connects remote audio and transcript deltas.
- Original and translated volume controls: Task 3 creates controls; Task 4 wires volume behavior.
- 30-minute silence and 120-minute max session: Task 4 implements production constants and test-mode shortened constants.
- Manual stop: Task 4 wires the stop button through shared cleanup.
- Markdown download: Task 4 implements `downloadMarkdown()`.
- Validation and recovery: Task 2 covers server errors; Task 4 covers browser cleanup and recoverable UI states.
- Testing: Tasks 2, 3, 4, 5, and 6 cover automated and manual verification.

Scope check:
- The plan stays within the approved Node + Express + single HTML PoC.
- React, DB storage, deployment, transcript post-processing, and glossary support remain outside this plan.

Completeness check:
- There are no incomplete task descriptions.
- The `.env` and `.env.example` files intentionally leave `OPENAI_API_KEY` empty because secrets must be supplied locally and must not be committed.
