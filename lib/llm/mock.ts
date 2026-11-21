import type { LlmProvider } from "./types";

/** Deterministic fake LLM for local work and tests. Makes no network call. */
export const mockLlm: LlmProvider = {
  name: "mock",
  async complete(request) {
    const inputChars = request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0);
    return {
      provider: "mock",
      costUsd: 0,
      text: "mock reply",
      inputTokens: Math.ceil(inputChars / 4),
      outputTokens: 3,
    };
  },
};
