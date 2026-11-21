import { z } from "zod";
import { optionalEnv, requireEnv } from "@/lib/config/env";
import { ProviderError } from "@/lib/providers/errors";
import { sendJsonRequest } from "@/lib/providers/http";
import { readPrice, tokenCostUsd } from "@/lib/providers/pricing";
import type { LlmProvider } from "./types";

const ENDPOINT = "https://api.openai.com/v1/responses";

/**
 * [VERIFY] "OpenAI small model" = GPT-5.4 mini, the newest mini tier seen in search results on 2026-11-21.
 * Its price there: USD 0.75 per 1M input tokens and 4.50 per 1M output tokens. GPT-5.4 nano is cheaper (0.20 / 1.25).
 * Set OPENAI_LLM_MODEL and the two price variables below to try another model.
 */
export const OPENAI_LLM_DEFAULT_MODEL = "gpt-5.4-mini";
export const OPENAI_LLM_USD_PER_M_INPUT = 0.75;
export const OPENAI_LLM_USD_PER_M_OUTPUT = 4.5;

export interface OpenAiLlmOptions {
  apiKey: string;
  model?: string;
  usdPerMillionInput?: number;
  usdPerMillionOutput?: number;
  /** Reasoning effort sent to the model, e.g. "none" or "low". Left out by default (GPT-5.4 mini defaults to none). */
  reasoningEffort?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const responseSchema = z.object({
  status: z.string().optional(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

/** OpenAI text model through the Responses API. Responses are not stored on OpenAI's side (store: false). */
export function createOpenAiLlm(options: OpenAiLlmOptions): LlmProvider {
  const model = options.model ?? OPENAI_LLM_DEFAULT_MODEL;
  const perInput = options.usdPerMillionInput ?? OPENAI_LLM_USD_PER_M_INPUT;
  const perOutput = options.usdPerMillionOutput ?? OPENAI_LLM_USD_PER_M_OUTPUT;
  const fetchFn = options.fetchFn ?? fetch;

  return {
    name: "openai",
    model,
    pricing: { usdPerMillionInput: perInput, usdPerMillionOutput: perOutput },
    async complete(request) {
      const wantsJson = request.responseFormat === "json";
      // OpenAI rejects JSON mode unless the prompt itself mentions JSON. Fail here with a clear reason instead.
      if (wantsJson && !/json/i.test(request.system + request.messages.map((m) => m.content).join(" "))) {
        throw new RangeError('responseFormat "json" needs the word JSON in the prompt');
      }
      const body: Record<string, unknown> = {
        model,
        instructions: request.system,
        input: request.messages.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: request.maxOutputTokens,
        store: false,
      };
      if (wantsJson) body.text = { format: { type: "json_object" } };
      if (options.reasoningEffort) body.reasoning = { effort: options.reasoningEffort };

      const reply = await sendJsonRequest(
        "openai",
        fetchFn,
        ENDPOINT,
        { method: "POST", headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
        options.timeoutMs,
      );
      const parsed = responseSchema.safeParse(reply);
      if (!parsed.success) throw new ProviderError("openai", null, "the reply had an unexpected shape");
      if (parsed.data.status === "incomplete") throw new ProviderError("openai", null, "the reply stopped early at the output token limit");

      const text = parsed.data.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "")
        .join("");
      const { input_tokens: inputTokens, output_tokens: outputTokens } = parsed.data.usage;
      return { provider: "openai", costUsd: tokenCostUsd(inputTokens, outputTokens, perInput, perOutput), text, inputTokens, outputTokens };
    },
  };
}

/** Reads OPENAI_API_KEY (required); OPENAI_LLM_MODEL, OPENAI_LLM_REASONING_EFFORT and the two price variables are optional. */
export function openAiLlmFromEnv(env: Record<string, string | undefined> = process.env): LlmProvider {
  return createOpenAiLlm({
    apiKey: requireEnv("OPENAI_API_KEY", env.OPENAI_API_KEY),
    model: optionalEnv("OPENAI_LLM_MODEL", env.OPENAI_LLM_MODEL),
    reasoningEffort: optionalEnv("OPENAI_LLM_REASONING_EFFORT", env.OPENAI_LLM_REASONING_EFFORT),
    usdPerMillionInput: readPrice("OPENAI_LLM_USD_PER_M_INPUT", OPENAI_LLM_USD_PER_M_INPUT, env),
    usdPerMillionOutput: readPrice("OPENAI_LLM_USD_PER_M_OUTPUT", OPENAI_LLM_USD_PER_M_OUTPUT, env),
  });
}
