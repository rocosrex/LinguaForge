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
