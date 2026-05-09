import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import express from "express";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const OPENAI_TRANSLATION_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/translations/client_secrets";
export const DEFAULT_HOST = "127.0.0.1";

const ALLOWED_TARGET_LANGUAGES = new Set(["ko", "ja", "zh", "es"]);
const LOCALHOST_SESSION_ERROR =
  "Forbidden: /session is only available from localhost";

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
    return {
      value: data.value,
      expires_at: data.expires_at,
    };
  }

  if (typeof data?.client_secret?.value === "string") {
    return {
      value: data.client_secret.value,
      expires_at: data.client_secret.expires_at,
    };
  }

  return data;
}

function normalizeLoopbackHost(value) {
  if (typeof value !== "string") {
    return "";
  }

  const host = value.trim().toLowerCase();

  if (!host) {
    return "";
  }

  if (host.startsWith("[")) {
    const closingBracketIndex = host.indexOf("]");
    const bracketedHost = host.slice(1, closingBracketIndex);
    const portSuffix = host.slice(closingBracketIndex + 1);

    if (
      closingBracketIndex > 0 &&
      (portSuffix === "" || /^:\d+$/.test(portSuffix))
    ) {
      return bracketedHost;
    }

    return "";
  }

  if (host === "::1" || /^::1:\d+$/.test(host)) {
    return "::1";
  }

  const [hostname, port, extra] = host.split(":");

  if (extra !== undefined || (port !== undefined && !/^\d+$/.test(port))) {
    return "";
  }

  return hostname;
}

function isLoopbackHost(value) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    normalizeLoopbackHost(value)
  );
}

function isLoopbackOrigin(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return true;
  }

  try {
    const origin = new URL(value);

    return origin.protocol === "http:" && isLoopbackHost(origin.host);
  } catch {
    return false;
  }
}

function requireLocalSessionRequest(req, res, next) {
  if (
    !isLoopbackHost(req.headers.host) ||
    !isLoopbackOrigin(req.headers.origin)
  ) {
    return res.status(403).json({
      error: LOCALHOST_SESSION_ERROR,
    });
  }

  return next();
}

export function createApp({
  apiKey = process.env.OPENAI_API_KEY,
  fetchImpl = globalThis.fetch,
  staticDir = path.join(__dirname, "public"),
} = {}) {
  const app = express();

  app.use(express.static(staticDir));
  app.use("/session", requireLocalSessionRequest);
  app.use(express.json({ limit: "16kb" }));

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
        });
      }

      const payload = extractClientSecretPayload(data);

      if (typeof payload?.value !== "string") {
        return res.status(502).json({
          error: "OpenAI session response did not include a client secret",
        });
      }

      return res.status(200).json(payload);
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
  const host = process.env.HOST ?? DEFAULT_HOST;
  const app = createApp();

  app.listen(port, host, () => {
    console.log(`Translation PoC running at http://${host}:${port}`);
  });
}
