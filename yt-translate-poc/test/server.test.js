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
