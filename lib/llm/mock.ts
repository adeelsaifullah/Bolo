import type { LlmProvider } from "./types";

/**
 * A feedback reply in the shape the voice test (P0-2) expects, so the whole pipeline can be rehearsed with no keys.
 * Not real feedback: the numbers and texts are fixed.
 */
export const MOCK_FEEDBACK_JSON = JSON.stringify({
  score_parts: { task_fit: 24, grammar: 14, vocabulary: 11, fluency: 8 },
  corrections: [
    { kind: "mistake", said: "mock said 1", better: "mock better 1", why: "mock explanation 1" },
    { kind: "mistake", said: "mock said 2", better: "mock better 2", why: "mock explanation 2" },
    { kind: "polish", said: "mock said 3", better: "mock better 3", why: "mock explanation 3" },
  ],
});

/** Deterministic fake LLM for local work and tests. Makes no network call. */
export const mockLlm: LlmProvider = {
  name: "mock",
  model: "mock",
  async complete(request) {
    const inputChars = request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0);
    return {
      provider: "mock",
      costUsd: 0,
      text: request.responseFormat === "json" ? MOCK_FEEDBACK_JSON : "mock reply",
      inputTokens: Math.ceil(inputChars / 4),
      outputTokens: 3,
    };
  },
};
