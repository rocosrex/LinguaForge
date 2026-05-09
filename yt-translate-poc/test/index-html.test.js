import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../public/index.html", import.meta.url);

async function readIndexHtml() {
  return readFile(htmlPath, "utf8");
}

function findElementById(html, id) {
  const match = html.match(new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>`, "i"));
  assert.ok(match, `Expected element with id="${id}"`);

  return {
    tagName: match[1].toLowerCase(),
    source: match[0],
  };
}

function assertAttribute(element, name, value) {
  assert.match(element.source, new RegExp(`\\b${name}="${value}"`));
}

function assertBooleanAttribute(element, name) {
  assert.match(element.source, new RegExp(`\\b${name}\\b`));
}

function assertElement(html, id, tagName) {
  const element = findElementById(html, id);
  assert.equal(element.tagName, tagName);

  return element;
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

test("index page exposes controls with expected semantics", async () => {
  const html = await readIndexHtml();

  const startBtn = assertElement(html, "startBtn", "button");
  assertAttribute(startBtn, "type", "button");

  const stopBtn = assertElement(html, "stopBtn", "button");
  assertAttribute(stopBtn, "type", "button");
  assertBooleanAttribute(stopBtn, "disabled");

  const downloadBtn = assertElement(html, "downloadBtn", "button");
  assertAttribute(downloadBtn, "type", "button");
  assertBooleanAttribute(downloadBtn, "disabled");

  const lang = assertElement(html, "lang", "select");
  const langBlock = html.slice(html.indexOf(lang.source), html.indexOf("</select>", html.indexOf(lang.source)));
  assert.match(langBlock, /<option\b[^>]*value="ko"[^>]*selected[^>]*>/);
  assert.match(langBlock, /<option\b[^>]*value="ja"[^>]*>/);
  assert.match(langBlock, /<option\b[^>]*value="zh"[^>]*>/);
  assert.match(langBlock, /<option\b[^>]*value="es"[^>]*>/);

  for (const id of ["originalVolume", "translatedVolume"]) {
    const input = assertElement(html, id, "input");
    assertAttribute(input, "type", "range");
    assertAttribute(input, "min", "0");
    assertAttribute(input, "max", "1");
    assertAttribute(input, "step", "0.01");
  }

  const translatedAudio = assertElement(html, "translatedAudio", "audio");
  assertBooleanAttribute(translatedAudio, "autoplay");
  assertBooleanAttribute(translatedAudio, "controls");

  const status = assertElement(html, "status", "span");
  assertAttribute(status, "role", "status");
  assertAttribute(status, "aria-live", "polite");

  const subtitles = assertElement(html, "subtitles", "section");
  assertAttribute(subtitles, "aria-live", "polite");

  assert.doesNotMatch(html, /--accent-strong\b/);
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
    "formatDownloadTimestamp",
    "startSilenceMonitor",
    "stopSession",
  ];

  for (const token of requiredTokens) {
    assert.match(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("index page hardens realtime session lifecycle", async () => {
  const html = await readIndexHtml();
  const requiredTokens = [
    "generation",
    "currentGeneration",
    "isCurrentGeneration",
    "activeStates",
    "\"requesting-capture\", \"creating-session\", \"connecting\", \"translating\"",
    "stopBtn.disabled = !activeStates.includes(nextState)",
    "AbortController",
    "abortController.signal",
    "pc.onconnectionstatechange",
    "pc.oniceconnectionstatechange",
    "\"failed\", \"disconnected\", \"closed\"",
    "handleSessionError",
    "cleanupStaleStart",
    "event.type?.includes(\"error\")",
    "audioContext.state === \"suspended\"",
    "audioContext.resume()",
    "formatDownloadTimestamp",
    "## Translation Transcript",
  ];

  for (const token of requiredTokens) {
    assert.match(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(html, /## Korean Transcript/);
  assert.doesNotMatch(html, /\.slice\(0,\s*13\)/);
  assert.match(html, /youtube-translation-\$\{timestamp\}\.md/);
});
