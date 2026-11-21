import { selectProvider } from "@/lib/providers/select";
import { mockLlm } from "./mock";
import type { LlmProvider } from "./types";

export type { LlmMessage, LlmProvider, LlmRequest, LlmResult } from "./types";

const registry: Record<string, () => LlmProvider> = { mock: () => mockLlm };

/** Chosen by LLM_PROVIDER. */
export function getLlmProvider(env?: Record<string, string | undefined>): LlmProvider {
  return selectProvider({ envName: "LLM_PROVIDER", defaultName: "mock", registry, env });
}
