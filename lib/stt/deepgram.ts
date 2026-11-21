import { z } from "zod";
import { optionalEnv, requireEnv } from "@/lib/config/env";
import { ProviderError } from "@/lib/providers/errors";
import { sendJsonRequest } from "@/lib/providers/http";
import { audioCostUsd, readPrice } from "@/lib/providers/pricing";
import type { SttProvider } from "./types";

const ENDPOINT = "https://api.deepgram.com/v1/listen";

export const DEEPGRAM_DEFAULT_MODEL = "nova-3";

/**
 * USD per audio minute, Nova-3 pre-recorded English.
 * [VERIFY] 0.0043 comes from search snippets of deepgram.com/pricing on 2026-11-21, not from the page itself, and the
 * price WITH mip_opt_out=true is not confirmed (Deepgram's docs say to check pricing before opting out).
 * Compare the voice test's computed total with the Deepgram dashboard, then set DEEPGRAM_USD_PER_MINUTE if it differs.
 */
export const DEEPGRAM_USD_PER_MINUTE = 0.0043;

export interface DeepgramOptions {
  apiKey: string;
  model?: string;
  usdPerMinute?: number;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const responseSchema = z.object({
  metadata: z.object({ duration: z.number().optional() }).optional(),
  results: z.object({
    channels: z.array(z.object({ alternatives: z.array(z.object({ transcript: z.string() })).min(1) })).min(1),
  }),
});

/**
 * Deepgram speech-to-text for pre-recorded audio. One request per answer.
 *
 * Rule: Deepgram uses customer audio to improve its models unless EVERY request says mip_opt_out=true.
 * Bolo promises users their audio is never used to train models, so the flag is always sent and cannot be turned off.
 */
export function createDeepgramStt(options: DeepgramOptions): SttProvider {
  const model = options.model ?? DEEPGRAM_DEFAULT_MODEL;
  const usdPerMinute = options.usdPerMinute ?? DEEPGRAM_USD_PER_MINUTE;
  const fetchFn = options.fetchFn ?? fetch;

  return {
    name: "deepgram",
    model,
    pricing: { usdPerAudioMinute: usdPerMinute },
    async transcribe(request) {
      const params = new URLSearchParams({
        model,
        language: request.language,
        punctuate: "true",
        mip_opt_out: "true",
      });
      const reply = await sendJsonRequest(
        "deepgram",
        fetchFn,
        `${ENDPOINT}?${params.toString()}`,
        {
          method: "POST",
          headers: { Authorization: `Token ${options.apiKey}`, "Content-Type": request.mimeType },
          body: request.audio as unknown as BodyInit,
        },
        options.timeoutMs,
      );
      const parsed = responseSchema.safeParse(reply);
      if (!parsed.success) throw new ProviderError("deepgram", null, "the reply had an unexpected shape");

      const audioSeconds = request.audioSeconds ?? parsed.data.metadata?.duration;
      if (audioSeconds === undefined) throw new ProviderError("deepgram", null, "could not tell how long the audio was, so the cost is unknown");

      const transcript = parsed.data.results.channels[0]?.alternatives[0]?.transcript ?? "";
      return { provider: "deepgram", costUsd: audioCostUsd(audioSeconds, usdPerMinute), transcript: transcript.trim(), audioSeconds };
    },
  };
}

/** Reads DEEPGRAM_API_KEY (required), DEEPGRAM_MODEL and DEEPGRAM_USD_PER_MINUTE (optional) from the environment. */
export function deepgramSttFromEnv(env: Record<string, string | undefined> = process.env): SttProvider {
  return createDeepgramStt({
    apiKey: requireEnv("DEEPGRAM_API_KEY", env.DEEPGRAM_API_KEY),
    model: optionalEnv("DEEPGRAM_MODEL", env.DEEPGRAM_MODEL),
    usdPerMinute: readPrice("DEEPGRAM_USD_PER_MINUTE", DEEPGRAM_USD_PER_MINUTE, env),
  });
}
