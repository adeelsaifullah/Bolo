import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/providers/errors";
import { fakeFetch, headerOf } from "@/lib/providers/fake-fetch";
import { audioCostUsd, readPrice, tokenCostUsd } from "@/lib/providers/pricing";
import { createGeminiLlm, geminiLlmFromEnv } from "./gemini";
import { getLlmProvider } from "./index";
import { mockLlm } from "./mock";
import { createOpenAiLlm, openAiLlmFromEnv } from "./openai";

const jsonRequest = {
  system: "You give feedback. Reply with JSON only.",
  messages: [{ role: "user" as const, content: "Transcript: i am happy" }],
  maxOutputTokens: 700,
  responseFormat: "json" as const,
};

const openAiReply = (overrides: Record<string, unknown> = {}) => ({
  status: "completed",
  output: [
    { type: "reasoning", content: [] },
    { type: "message", content: [{ type: "output_text", text: '{"ok":' }, { type: "output_text", text: "true}" }] },
  ],
  usage: { input_tokens: 1000, output_tokens: 500 },
  ...overrides,
});

const geminiReply = (overrides: Record<string, unknown> = {}) => ({
  candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking...", thought: true }, { text: '{"ok":true}' }] } }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 300, thoughtsTokenCount: 200 },
  ...overrides,
});

afterEach(() => vi.unstubAllEnvs());

describe("OpenAI text model", () => {
  it("sends a Responses API request with JSON mode, no storage and no reasoning field by default", async () => {
    const { fetchFn, calls } = fakeFetch({ body: openAiReply() });
    await createOpenAiLlm({ apiKey: "sk-secret", fetchFn }).complete(jsonRequest);

    const call = calls[0]!;
    expect(call.url).toBe("https://api.openai.com/v1/responses");
    expect(headerOf(call.init, "authorization")).toBe("Bearer sk-secret");
    expect(JSON.parse(call.init.body as string)).toEqual({
      model: "gpt-5.4-mini",
      instructions: jsonRequest.system,
      input: [{ role: "user", content: "Transcript: i am happy" }],
      max_output_tokens: 700,
      store: false,
      text: { format: { type: "json_object" } },
    });
  });

  it("sends a reasoning effort only when one is set, and leaves JSON mode out for text", async () => {
    const { fetchFn, calls } = fakeFetch({ body: openAiReply() });
    await createOpenAiLlm({ apiKey: "k", reasoningEffort: "low", fetchFn }).complete({ ...jsonRequest, responseFormat: "text" });
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.text).toBeUndefined();
  });

  it("joins the message text, ignores other output items, and costs input and output tokens", async () => {
    const { fetchFn } = fakeFetch({ body: openAiReply() });
    const result = await createOpenAiLlm({ apiKey: "k", usdPerMillionInput: 0.75, usdPerMillionOutput: 4.5, fetchFn }).complete(jsonRequest);
    expect(result).toMatchObject({ provider: "openai", text: '{"ok":true}', inputTokens: 1000, outputTokens: 500 });
    expect(result.costUsd).toBeCloseTo(0.003, 10);
  });

  it("refuses JSON mode when the prompt never says JSON, before any request", async () => {
    const { fetchFn, calls } = fakeFetch({ body: openAiReply() });
    await expect(
      createOpenAiLlm({ apiKey: "k", fetchFn }).complete({ ...jsonRequest, system: "Give feedback.", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/word JSON/);
    expect(calls).toHaveLength(0);
  });

  it("reports a reply cut off at the token limit instead of returning half a JSON", async () => {
    const { fetchFn } = fakeFetch({ body: openAiReply({ status: "incomplete" }) });
    await expect(createOpenAiLlm({ apiKey: "k", fetchFn }).complete(jsonRequest)).rejects.toThrow(/stopped early/);
  });

  it("turns HTTP errors into ProviderErrors and rejects a reply of the wrong shape", async () => {
    const bad = fakeFetch({ status: 400, body: { error: { message: "Unknown model" } } });
    const error = await createOpenAiLlm({ apiKey: "k", fetchFn: bad.fetchFn }).complete(jsonRequest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).message).toContain("Unknown model");

    const odd = fakeFetch({ body: { nothing: true } });
    await expect(createOpenAiLlm({ apiKey: "k", fetchFn: odd.fetchFn }).complete(jsonRequest)).rejects.toThrow(/unexpected shape/);
  });

  it("exposes the unit prices it uses, including ones set in the environment", () => {
    expect(createOpenAiLlm({ apiKey: "k" }).pricing).toEqual({ usdPerMillionInput: 0.75, usdPerMillionOutput: 4.5 });
    expect(openAiLlmFromEnv({ OPENAI_API_KEY: "k", OPENAI_LLM_USD_PER_M_INPUT: "0.2", OPENAI_LLM_USD_PER_M_OUTPUT: "1.25" }).pricing).toEqual({ usdPerMillionInput: 0.2, usdPerMillionOutput: 1.25 });
  });

  it("reads its key, model, reasoning effort and prices from the environment", () => {
    expect(() => openAiLlmFromEnv({})).toThrow(/OPENAI_API_KEY/);
    expect(openAiLlmFromEnv({ OPENAI_API_KEY: "k", OPENAI_LLM_MODEL: "gpt-5.4-nano" })).toMatchObject({ name: "openai", model: "gpt-5.4-nano" });
    expect(() => openAiLlmFromEnv({ OPENAI_API_KEY: "k", OPENAI_LLM_USD_PER_M_INPUT: "-1" })).toThrow(/OPENAI_LLM_USD_PER_M_INPUT/);
  });
});

describe("Gemini", () => {
  it("sends a generateContent request with the key in a header, JSON mode and a thinking level", async () => {
    const { fetchFn, calls } = fakeFetch({ body: geminiReply() });
    await createGeminiLlm({ apiKey: "g-secret", thinkingLevel: "low", fetchFn }).complete({
      ...jsonRequest,
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "second" },
      ],
    });

    const call = calls[0]!;
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(call.url).not.toContain("g-secret");
    expect(headerOf(call.init, "x-goog-api-key")).toBe("g-secret");
    expect(JSON.parse(call.init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: jsonRequest.system }] },
      contents: [
        { role: "user", parts: [{ text: "first" }] },
        { role: "model", parts: [{ text: "second" }] },
      ],
      generationConfig: { maxOutputTokens: 700, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
    });
  });

  it("counts thinking tokens as output, and leaves thinking text out of the reply", async () => {
    const { fetchFn } = fakeFetch({ body: geminiReply() });
    const result = await createGeminiLlm({ apiKey: "k", usdPerMillionInput: 1.5, usdPerMillionOutput: 7.5, fetchFn }).complete(jsonRequest);
    expect(result).toMatchObject({ provider: "gemini", text: '{"ok":true}', inputTokens: 1000, outputTokens: 500 });
    expect(result.costUsd).toBeCloseTo((1000 * 1.5 + 500 * 7.5) / 1_000_000, 10);
  });

  it("leaves out the thinking field when no level is set", async () => {
    const { fetchFn, calls } = fakeFetch({ body: geminiReply() });
    await createGeminiLlm({ apiKey: "k", fetchFn }).complete({ ...jsonRequest, responseFormat: "text" });
    const body = JSON.parse(calls[0]!.init.body as string) as { generationConfig: Record<string, unknown> };
    expect(body.generationConfig).toEqual({ maxOutputTokens: 700 });
  });

  it("reports a cut-off reply, a blocked prompt and a missing candidate", async () => {
    const cut = fakeFetch({ body: geminiReply({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] }) });
    await expect(createGeminiLlm({ apiKey: "k", fetchFn: cut.fetchFn }).complete(jsonRequest)).rejects.toThrow(/stopped early/);

    const blocked = fakeFetch({ body: geminiReply({ candidates: undefined, promptFeedback: { blockReason: "SAFETY" } }) });
    await expect(createGeminiLlm({ apiKey: "k", fetchFn: blocked.fetchFn }).complete(jsonRequest)).rejects.toThrow(/blocked \(SAFETY\)/);

    const none = fakeFetch({ body: geminiReply({ candidates: [] }) });
    await expect(createGeminiLlm({ apiKey: "k", fetchFn: none.fetchFn }).complete(jsonRequest)).rejects.toThrow(/no candidate/);
  });

  it("turns HTTP errors into ProviderErrors", async () => {
    const { fetchFn } = fakeFetch({ status: 404, body: { error: { message: "models/gemini-3.8-flash is not found" } } });
    const error = await createGeminiLlm({ apiKey: "k", fetchFn }).complete(jsonRequest).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBe(404);
    expect((error as ProviderError).message).toContain("is not found");
  });

  it("exposes the unit prices it uses", () => {
    expect(createGeminiLlm({ apiKey: "k" }).pricing).toEqual({ usdPerMillionInput: 1.5, usdPerMillionOutput: 7.5 });
    expect(geminiLlmFromEnv({ GEMINI_API_KEY: "k", GEMINI_USD_PER_M_OUTPUT: "3.75" }).pricing).toEqual({ usdPerMillionInput: 1.5, usdPerMillionOutput: 3.75 });
  });

  it("reads its key and model from the environment", () => {
    expect(() => geminiLlmFromEnv({})).toThrow(/GEMINI_API_KEY/);
    expect(geminiLlmFromEnv({ GEMINI_API_KEY: "k" })).toMatchObject({ name: "gemini", model: "gemini-3.8-flash" });
    expect(geminiLlmFromEnv({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-3.8-flash-lite" })).toMatchObject({ model: "gemini-3.8-flash-lite" });
  });

  it("thinks at level low unless told otherwise, and an empty GEMINI_THINKING_LEVEL leaves it out", async () => {
    const sentConfig = async (env: Record<string, string>) => {
      const { fetchFn, calls } = fakeFetch({ body: geminiReply() });
      await geminiLlmFromEnv({ GEMINI_API_KEY: "k", ...env }, fetchFn).complete(jsonRequest);
      return (JSON.parse(calls[0]!.init.body as string) as { generationConfig: { thinkingConfig?: unknown } }).generationConfig.thinkingConfig;
    };
    expect(await sentConfig({})).toEqual({ thinkingLevel: "low" });
    expect(await sentConfig({ GEMINI_THINKING_LEVEL: "minimal" })).toEqual({ thinkingLevel: "minimal" });
    expect(await sentConfig({ GEMINI_THINKING_LEVEL: "" })).toBeUndefined();
  });
});

describe("choosing an LLM by name", () => {
  it("fails with the missing key's name, and the mock still works with no keys", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(() => getLlmProvider({ LLM_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(() => getLlmProvider({ LLM_PROVIDER: "gemini" })).toThrow(/GEMINI_API_KEY/);
    expect(getLlmProvider({ LLM_PROVIDER: "mock" })).toBe(mockLlm);
  });
});

describe("the mock LLM", () => {
  it("keeps its plain reply, and returns a feedback-shaped JSON only when JSON is asked for", async () => {
    expect((await mockLlm.complete({ system: "s", messages: [], maxOutputTokens: 10 })).text).toBe("mock reply");
    const json = await mockLlm.complete({ system: "s", messages: [], maxOutputTokens: 10, responseFormat: "json" });
    expect(JSON.parse(json.text)).toMatchObject({ score_parts: { task_fit: 24 }, corrections: expect.any(Array) });
  });
});

describe("price helpers", () => {
  it("works out audio and token costs", () => {
    expect(audioCostUsd(90, 0.006)).toBeCloseTo(0.009, 10);
    expect(tokenCostUsd(2_000_000, 1_000_000, 0.75, 4.5)).toBeCloseTo(6, 10);
  });

  it("reads a price override, falls back when unset, and rejects nonsense", () => {
    expect(readPrice("P", 0.5, {})).toBe(0.5);
    expect(readPrice("P", 0.5, { P: " 0.7 " })).toBe(0.7);
    expect(readPrice("P", 0.5, { P: "" })).toBe(0.5);
    for (const bad of ["abc", "0", "-2"]) expect(() => readPrice("P", 0.5, { P: bad })).toThrow(/"P"|\bP\b/);
  });
});
