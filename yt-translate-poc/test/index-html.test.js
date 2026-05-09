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
