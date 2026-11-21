import { z } from "zod";
import { optionalEnv, requireEnv } from "@/lib/config/env";
import { extensionForMime } from "@/lib/providers/audio";
import { ProviderError } from "@/lib/providers/errors";
import { sendJsonRequest } from "@/lib/providers/http";
import { audioCostUsd, readPrice } from "@/lib/providers/pricing";
import type { SttProvider } from "./types";

const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

/**
 * [VERIFY] gpt-4o-mini-transcribe is marked Deprecated on OpenAI's model page and the speech-to-text guide points to
 * gpt-transcribe, so that is the default. Seen in search results on 2026-11-21, not on the pages themselves.
 * Set OPENAI_STT_MODEL to try another one.
 */
export const OPENAI_STT_DEFAULT_MODEL = "gpt-transcribe";

/**
 * USD per audio minute for gpt-transcribe.
 * [VERIFY] 0.0045 comes from one search snippet of OpenAI's pricing page on 2026-11-21. Other models differ
 * (gpt-4o-mini-transcribe about 0.003, gpt-4o-transcribe and whisper-1 about 0.006), so set OPENAI_STT_USD_PER_MINUTE
 * whenever OPENAI_STT_MODEL changes.
 */
export const OPENAI_STT_USD_PER_MINUTE = 0.0045;

export interface OpenAiSttOptions {
  apiKey: string;
  model?: string;
  usdPerMinute?: number;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const responseSchema = z.object({ text: z.string() });

/** OpenAI speech-to-text. API data is not used for training by default; OpenAI may keep it up to 30 days for abuse checks. */
export function createOpenAiStt(options: OpenAiSttOptions): SttProvider {
  const model = options.model ?? OPENAI_STT_DEFAULT_MODEL;
  const usdPerMinute = options.usdPerMinute ?? OPENAI_STT_USD_PER_MINUTE;
  const fetchFn = options.fetchFn ?? fetch;

  return {
    name: "openai",
    model,
    pricing: { usdPerAudioMinute: usdPerMinute },
    async transcribe(request) {
      // Bolo records only what it measured: a caller-supplied length is required because the reply may not carry one.
      if (request.audioSeconds === undefined) {
        throw new ProviderError("openai", null, "audioSeconds is required so the cost can be worked out");
      }
      const form = new FormData();
      form.append("file", new Blob([request.audio as unknown as BlobPart], { type: request.mimeType }), `audio.${extensionForMime(request.mimeType)}`);
      form.append("model", model);
      form.append("language", request.language);
      form.append("response_format", "json");

      const reply = await sendJsonRequest(
        "openai",
        fetchFn,
        ENDPOINT,
        { method: "POST", headers: { Authorization: `Bearer ${options.apiKey}` }, body: form },
        options.timeoutMs,
      );
      const parsed = responseSchema.safeParse(reply);
      if (!parsed.success) throw new ProviderError("openai", null, "the reply had an unexpected shape");

      return {
        provider: "openai",
        costUsd: audioCostUsd(request.audioSeconds, usdPerMinute),
        transcript: parsed.data.text.trim(),
        audioSeconds: request.audioSeconds,
      };
    },
  };
}

/** Reads OPENAI_API_KEY (required), OPENAI_STT_MODEL and OPENAI_STT_USD_PER_MINUTE (optional) from the environment. */
export function openAiSttFromEnv(env: Record<string, string | undefined> = process.env): SttProvider {
  return createOpenAiStt({
    apiKey: requireEnv("OPENAI_API_KEY", env.OPENAI_API_KEY),
    model: optionalEnv("OPENAI_STT_MODEL", env.OPENAI_STT_MODEL),
    usdPerMinute: readPrice("OPENAI_STT_USD_PER_MINUTE", OPENAI_STT_USD_PER_MINUTE, env),
  });
}
