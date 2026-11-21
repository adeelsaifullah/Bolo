import { selectProvider } from "@/lib/providers/select";
import { geminiLlmFromEnv } from "./gemini";
import { mockLlm } from "./mock";
import { openAiLlmFromEnv } from "./openai";
import type { LlmProvider } from "./types";

export type { LlmMessage, LlmProvider, LlmRequest, LlmResult } from "./types";

// Real providers read their own key from the environment only when they are chosen.
const registry: Record<string, () => LlmProvider> = {
  mock: () => mockLlm,
  openai: () => openAiLlmFromEnv(),
  gemini: () => geminiLlmFromEnv(),
};

/** Chosen by LLM_PROVIDER. */
export function getLlmProvider(env?: Record<string, string | undefined>): LlmProvider {
  return selectProvider({ envName: "LLM_PROVIDER", defaultName: "mock", registry, env });
}
