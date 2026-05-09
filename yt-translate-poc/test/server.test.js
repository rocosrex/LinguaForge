import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import {
  DEFAULT_HOST,
  OPENAI_TRANSLATION_CLIENT_SECRETS_URL,
  createApp,
  normalizeHost,
  normalizeTargetLanguage,
} from "../server.js";

function requestJson(
  app,
  { method = "POST", path = "/session", body, headers: extraHeaders } = {}
) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const bodyHeaders = payload
        ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          }
        : {};
      const headers = {
        ...bodyHeaders,
        ...(typeof extraHeaders === "function"
          ? extraHeaders(address)
          : extraHeaders),
      };

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

test("direct startup defaults to loopback host", () => {
  assert.equal(DEFAULT_HOST, "127.0.0.1");
});

test("normalizeHost defaults blank values to the default host", () => {
  assert.equal(normalizeHost(undefined), DEFAULT_HOST);
  assert.equal(normalizeHost(""), DEFAULT_HOST);
  assert.equal(normalizeHost("   "), DEFAULT_HOST);
});

test("normalizeHost accepts loopback bind hosts", () => {
  assert.equal(normalizeHost("localhost"), "localhost");
  assert.equal(normalizeHost("127.0.0.1"), "127.0.0.1");
  assert.equal(normalizeHost("::1"), "::1");
});

test("normalizeHost rejects non-loopback bind hosts", () => {
  assert.throws(
    () => normalizeHost("0.0.0.0"),
    /Unsafe HOST: 0\.0\.0\.0/
  );
  assert.throws(
    () => normalizeHost("192.168.1.20"),
    /Unsafe HOST: 192\.168\.1\.20/
  );
});

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

test("POST /session sanitizes top-level OpenAI client secret responses", async () => {
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () =>
      Response.json({
        value: "client-secret-test",
        expires_at: 1234567890,
        sensitive_debug_context: "do-not-forward",
      }),
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

test("POST /session does not expose raw OpenAI error details", async () => {
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () =>
      Response.json(
        {
          error: {
            message: "Invalid request",
          },
          sensitive_debug_context: {
            upstream_request_id: "req-secret",
          },
        },
        {
          status: 400,
        }
      ),
  });

  const response = await requestJson(app, {
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Invalid request",
  });
});

test("POST /session rejects successful OpenAI responses without a client secret", async () => {
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () => Response.json({}),
  });

  const response = await requestJson(app, {
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    error: "OpenAI session response did not include a client secret",
  });
});

test("POST /session returns a 502 when OpenAI fetch fails", async () => {
  const originalConsoleError = console.error;
  let loggedMessage;
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  });

  console.error = (message) => {
    loggedMessage = message;
  };

  let response;
  try {
    response = await requestJson(app, {
      body: {
        targetLanguage: "ko",
      },
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.status, 502);
  assert.deepEqual(response.body, {
    error: "Failed to create OpenAI translation session",
  });
  assert.equal(loggedMessage, "Failed to create translation session");
});

test("POST /session rejects non-local Host before calling OpenAI", async () => {
  let fetchCalled = false;
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () => {
      fetchCalled = true;
      return Response.json({
        value: "client-secret-test",
      });
    },
  });

  const response = await requestJson(app, {
    headers: {
      Host: "evil.example:3000",
    },
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: "Forbidden: /session is only available from localhost",
  });
  assert.equal(fetchCalled, false);
});

test("POST /session allows localhost Host with port", async () => {
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () =>
      Response.json({
        value: "client-secret-test",
        expires_at: 1234567890,
      }),
  });

  const response = await requestJson(app, {
    headers: (address) => ({
      Host: `localhost:${address.port}`,
    }),
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    value: "client-secret-test",
    expires_at: 1234567890,
  });
});

test("POST /session rejects non-local Origin before calling OpenAI", async () => {
  let fetchCalled = false;
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () => {
      fetchCalled = true;
      return Response.json({
        value: "client-secret-test",
      });
    },
  });

  const response = await requestJson(app, {
    headers: (address) => ({
      Host: `localhost:${address.port}`,
      Origin: "http://evil.example",
    }),
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: "Forbidden: /session is only available from localhost",
  });
  assert.equal(fetchCalled, false);
});

test("POST /session allows localhost Origin with port", async () => {
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () =>
      Response.json({
        value: "client-secret-test",
        expires_at: 1234567890,
      }),
  });

  const response = await requestJson(app, {
    headers: (address) => ({
      Host: `localhost:${address.port}`,
      Origin: `http://localhost:${address.port}`,
    }),
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    value: "client-secret-test",
    expires_at: 1234567890,
  });
});

test("POST /session allows IPv6 localhost Host with port", async () => {
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () =>
      Response.json({
        value: "client-secret-test",
        expires_at: 1234567890,
      }),
  });

  const response = await requestJson(app, {
    headers: {
      Host: "[::1]:3000",
    },
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    value: "client-secret-test",
    expires_at: 1234567890,
  });
});

test("POST /session allows IPv6 localhost Origin with allowed Host", async () => {
  const app = createApp({
    apiKey: "sk-test",
    fetchImpl: async () =>
      Response.json({
        value: "client-secret-test",
        expires_at: 1234567890,
      }),
  });

  const response = await requestJson(app, {
    headers: {
      Host: "[::1]:3000",
      Origin: "http://[::1]:3000",
    },
    body: {
      targetLanguage: "ko",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    value: "client-secret-test",
    expires_at: 1234567890,
  });
});
