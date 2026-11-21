import { z } from "zod";
import { optionalEnv, requireEnv } from "@/lib/config/env";
import { ProviderError } from "@/lib/providers/errors";
import { sendJsonRequest } from "@/lib/providers/http";
import { readPrice, tokenCostUsd } from "@/lib/providers/pricing";
import type { LlmProvider } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * [VERIFY] "Gemini Flash" = gemini-3.8-flash, from search results on 2026-11-21 (not the pages themselves).
 * Introductory price USD 0.75 / 3.75 per 1M input / output tokens until 2026-12-31; standard price USD 1.50 / 7.50
 * from 2027-01-01. Soft launch is after that date, so the standard price is the default here.
 * Thinking tokens are billed as output tokens, and this model thinks at "medium" unless told otherwise.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
export const GEMINI_USD_PER_M_INPUT = 1.5;
export const GEMINI_USD_PER_M_OUTPUT = 7.5;
/** Kept low to limit billed thinking tokens. [VERIFY] the field name and values for this model. Empty env value omits it. */
export const GEMINI_DEFAULT_THINKING_LEVEL = "low";

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  usdPerMillionInput?: number;
  usdPerMillionOutput?: number;
  /** Sent as generationConfig.thinkingConfig.thinkingLevel. undefined omits it. */
  thinkingLevel?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).optional() }).optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  usageMetadata: z.object({
    promptTokenCount: z.number(),
    candidatesTokenCount: z.number().optional(),
    thoughtsTokenCount: z.number().optional(),
  }),
});

/**
 * Google Gemini through the Gemini API.
 * Rule: Google only keeps content out of its product training for billing-enabled (paid) projects, so the key
 * must come from a project with Cloud Billing switched on.
 */
export function createGeminiLlm(options: GeminiOptions): LlmProvider {
  const model = options.model ?? GEMINI_DEFAULT_MODEL;
  const perInput = options.usdPerMillionInput ?? GEMINI_USD_PER_M_INPUT;
  const perOutput = options.usdPerMillionOutput ?? GEMINI_USD_PER_M_OUTPUT;
  const fetchFn = options.fetchFn ?? fetch;

  return {
    name: "gemini",
    model,
    pricing: { usdPerMillionInput: perInput, usdPerMillionOutput: perOutput },
    async complete(request) {
      const generationConfig: Record<string, unknown> = { maxOutputTokens: request.maxOutputTokens };
      if (request.responseFormat === "json") generationConfig.responseMimeType = "application/json";
      if (options.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: options.thinkingLevel };

      const body = {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: request.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig,
      };
      const reply = await sendJsonRequest(
        "gemini",
        fetchFn,
        `${BASE}/${encodeURIComponent(model)}:generateContent`,
        { method: "POST", headers: { "x-goog-api-key": options.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) },
        options.timeoutMs,
      );
      const parsed = responseSchema.safeParse(reply);
      if (!parsed.success) throw new ProviderError("gemini", null, "the reply had an unexpected shape");

      const candidate = parsed.data.candidates?.[0];
      if (!candidate) {
        const reason = parsed.data.promptFeedback?.blockReason;
        throw new ProviderError("gemini", null, reason ? `the prompt was blocked (${reason})` : "the reply had no candidate");
      }
      if (candidate.finishReason === "MAX_TOKENS") throw new ProviderError("gemini", null, "the reply stopped early at the output token limit");

      const text = (candidate.content?.parts ?? [])
        .filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("");
      const usage = parsed.data.usageMetadata;
      const inputTokens = usage.promptTokenCount;
      // Thinking tokens are billed at the output price, so they count as output.
      const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
      return { provider: "gemini", costUsd: tokenCostUsd(inputTokens, outputTokens, perInput, perOutput), text, inputTokens, outputTokens };
    },
  };
}

/**
 * Reads GEMINI_API_KEY (required); GEMINI_MODEL, GEMINI_THINKING_LEVEL (empty = leave out) and the two price
 * variables are optional.
 */
export function geminiLlmFromEnv(env: Record<string, string | undefined> = process.env, fetchFn?: typeof fetch): LlmProvider {
  return createGeminiLlm({
    fetchFn,
    apiKey: requireEnv("GEMINI_API_KEY", env.GEMINI_API_KEY),
    model: optionalEnv("GEMINI_MODEL", env.GEMINI_MODEL),
    thinkingLevel: env.GEMINI_THINKING_LEVEL === undefined ? GEMINI_DEFAULT_THINKING_LEVEL : optionalEnv("GEMINI_THINKING_LEVEL", env.GEMINI_THINKING_LEVEL),
    usdPerMillionInput: readPrice("GEMINI_USD_PER_M_INPUT", GEMINI_USD_PER_M_INPUT, env),
    usdPerMillionOutput: readPrice("GEMINI_USD_PER_M_OUTPUT", GEMINI_USD_PER_M_OUTPUT, env),
  });
}
