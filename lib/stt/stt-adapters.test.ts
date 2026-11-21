import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/lib/config/errors";
import { ProviderError } from "@/lib/providers/errors";
import { fakeFetch, headerOf } from "@/lib/providers/fake-fetch";
import { createDeepgramStt, DEEPGRAM_USD_PER_MINUTE, deepgramSttFromEnv } from "./deepgram";
import { getSttProvider } from "./index";
import { createOpenAiStt, openAiSttFromEnv } from "./openai";

const AUDIO = new Uint8Array([1, 2, 3, 4]);
const request = { audio: AUDIO, mimeType: "audio/webm", language: "en", consentVersion: "pilot-v1", audioSeconds: 30 };
const deepgramReply = {
  metadata: { duration: 29.5 },
  results: { channels: [{ alternatives: [{ transcript: "  i am very happy to meet you  " }] }] },
};

afterEach(() => vi.unstubAllEnvs());

describe("Deepgram speech-to-text", () => {
  it("always opts out of model training and sends the expected request", async () => {
    const { fetchFn, calls } = fakeFetch({ body: deepgramReply });
    await createDeepgramStt({ apiKey: "dg-secret", fetchFn }).transcribe(request);

    const call = calls[0]!;
    const url = new URL(call.url);
    expect(url.origin + url.pathname).toBe("https://api.deepgram.com/v1/listen");
    expect(url.searchParams.get("mip_opt_out")).toBe("true");
    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("punctuate")).toBe("true");
    expect(headerOf(call.init, "authorization")).toBe("Token dg-secret");
    expect(headerOf(call.init, "content-type")).toBe("audio/webm");
    expect(call.init.body).toBe(AUDIO);
    expect(call.init.method).toBe("POST");
  });

  it("keeps the opt-out even for a different model", async () => {
    const { fetchFn, calls } = fakeFetch({ body: deepgramReply });
    await createDeepgramStt({ apiKey: "k", model: "nova-2", fetchFn }).transcribe(request);
    expect(new URL(calls[0]!.url).searchParams.get("mip_opt_out")).toBe("true");
  });

  it("returns the trimmed transcript and costs the caller's measured length", async () => {
    const { fetchFn } = fakeFetch({ body: deepgramReply });
    const result = await createDeepgramStt({ apiKey: "k", fetchFn }).transcribe(request);
    expect(result).toMatchObject({ provider: "deepgram", transcript: "i am very happy to meet you", audioSeconds: 30 });
    expect(result.costUsd).toBeCloseTo((30 / 60) * DEEPGRAM_USD_PER_MINUTE, 10);
  });

  it("falls back to the length Deepgram reports, and refuses to guess when there is none", async () => {
    const { fetchFn } = fakeFetch({ body: deepgramReply });
    const provider = createDeepgramStt({ apiKey: "k", fetchFn });
    expect((await provider.transcribe({ ...request, audioSeconds: undefined })).audioSeconds).toBe(29.5);

    const noLength = fakeFetch({ body: { results: deepgramReply.results } });
    await expect(createDeepgramStt({ apiKey: "k", fetchFn: noLength.fetchFn }).transcribe({ ...request, audioSeconds: undefined })).rejects.toThrow(/cost is unknown/);
  });

  it("uses the price it was given", async () => {
    const { fetchFn } = fakeFetch({ body: deepgramReply });
    const result = await createDeepgramStt({ apiKey: "k", usdPerMinute: 0.01, fetchFn }).transcribe({ ...request, audioSeconds: 60 });
    expect(result.costUsd).toBeCloseTo(0.01, 10);
  });

  it("turns HTTP errors into ProviderErrors that show the reason but never the key", async () => {
    const { fetchFn } = fakeFetch({ status: 401, body: { err_code: "INVALID_AUTH", err_msg: "Invalid credentials." } });
    const error = await createDeepgramStt({ apiKey: "dg-secret", fetchFn }).transcribe(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBe(401);
    expect((error as ProviderError).retryable).toBe(false);
    expect((error as ProviderError).message).toContain("Invalid credentials.");
    expect((error as ProviderError).message).not.toContain("dg-secret");
  });

  it.each([429, 500, 503])("treats HTTP %i as worth retrying", async (status) => {
    const { fetchFn } = fakeFetch({ status, body: "busy" });
    const error = await createDeepgramStt({ apiKey: "k", fetchFn }).transcribe(request).catch((e: unknown) => e);
    expect((error as ProviderError).retryable).toBe(true);
  });

  it("turns a network failure into a retryable ProviderError", async () => {
    const { fetchFn } = fakeFetch({ fail: new TypeError("fetch failed: dg-secret") });
    const error = await createDeepgramStt({ apiKey: "dg-secret", fetchFn }).transcribe(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBeNull();
    expect((error as ProviderError).retryable).toBe(true);
    expect((error as ProviderError).message).not.toContain("dg-secret");
  });

  it("rejects a reply of the wrong shape", async () => {
    const { fetchFn } = fakeFetch({ body: { hello: "world" } });
    await expect(createDeepgramStt({ apiKey: "k", fetchFn }).transcribe(request)).rejects.toThrow(/unexpected shape/);
  });

  it("exposes the unit price it uses, including one set in the environment", () => {
    expect(createDeepgramStt({ apiKey: "k" }).pricing).toEqual({ usdPerAudioMinute: DEEPGRAM_USD_PER_MINUTE });
    expect(createDeepgramStt({ apiKey: "k", usdPerMinute: 0.01 }).pricing).toEqual({ usdPerAudioMinute: 0.01 });
    expect(deepgramSttFromEnv({ DEEPGRAM_API_KEY: "k", DEEPGRAM_USD_PER_MINUTE: "0.009" }).pricing).toEqual({ usdPerAudioMinute: 0.009 });
  });

  it("reads its key and optional settings from the environment", () => {
    expect(() => deepgramSttFromEnv({})).toThrow(ConfigError);
    expect(() => deepgramSttFromEnv({})).toThrow(/DEEPGRAM_API_KEY/);
    expect(deepgramSttFromEnv({ DEEPGRAM_API_KEY: "k", DEEPGRAM_MODEL: "nova-2" })).toMatchObject({ name: "deepgram", model: "nova-2" });
    expect(() => deepgramSttFromEnv({ DEEPGRAM_API_KEY: "k", DEEPGRAM_USD_PER_MINUTE: "free" })).toThrow(/DEEPGRAM_USD_PER_MINUTE/);
  });
});

describe("OpenAI speech-to-text", () => {
  it("sends a multipart upload with the model, language and a file name that matches the audio type", async () => {
    const { fetchFn, calls } = fakeFetch({ body: { text: " hello there " } });
    await createOpenAiStt({ apiKey: "sk-secret", fetchFn }).transcribe(request);

    const call = calls[0]!;
    expect(call.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(headerOf(call.init, "authorization")).toBe("Bearer sk-secret");
    const form = call.init.body as FormData;
    expect(form.get("model")).toBe("gpt-transcribe");
    expect(form.get("language")).toBe("en");
    expect(form.get("response_format")).toBe("json");
    expect((form.get("file") as File).name).toBe("audio.webm");
  });

  it("returns the trimmed transcript and costs the caller's measured length", async () => {
    const { fetchFn } = fakeFetch({ body: { text: " hello there " } });
    const result = await createOpenAiStt({ apiKey: "k", usdPerMinute: 0.006, fetchFn }).transcribe({ ...request, audioSeconds: 90 });
    expect(result).toMatchObject({ provider: "openai", transcript: "hello there", audioSeconds: 90 });
    expect(result.costUsd).toBeCloseTo(0.009, 10);
  });

  it("needs the audio length, because the reply does not carry one", async () => {
    const { fetchFn, calls } = fakeFetch({ body: { text: "x" } });
    await expect(createOpenAiStt({ apiKey: "k", fetchFn }).transcribe({ ...request, audioSeconds: undefined })).rejects.toThrow(/audioSeconds is required/);
    expect(calls).toHaveLength(0);
  });

  it("refuses an audio type it cannot name before sending anything", async () => {
    const { fetchFn, calls } = fakeFetch({ body: { text: "x" } });
    await expect(createOpenAiStt({ apiKey: "k", fetchFn }).transcribe({ ...request, mimeType: "audio/amr" })).rejects.toThrow(/unsupported audio type/);
    expect(calls).toHaveLength(0);
  });

  it("turns HTTP errors into ProviderErrors", async () => {
    const { fetchFn } = fakeFetch({ status: 429, body: { error: { message: "Rate limit reached" } } });
    const error = await createOpenAiStt({ apiKey: "k", fetchFn }).transcribe(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).retryable).toBe(true);
    expect((error as ProviderError).message).toContain("Rate limit reached");
  });

  it("exposes the unit price it uses", () => {
    expect(createOpenAiStt({ apiKey: "k", usdPerMinute: 0.006 }).pricing).toEqual({ usdPerAudioMinute: 0.006 });
    expect(openAiSttFromEnv({ OPENAI_API_KEY: "k", OPENAI_STT_USD_PER_MINUTE: "0.003" }).pricing).toEqual({ usdPerAudioMinute: 0.003 });
  });

  it("reads its key and optional settings from the environment", () => {
    expect(() => openAiSttFromEnv({})).toThrow(/OPENAI_API_KEY/);
    expect(openAiSttFromEnv({ OPENAI_API_KEY: "k", OPENAI_STT_MODEL: "gpt-4o-mini-transcribe" })).toMatchObject({ name: "openai", model: "gpt-4o-mini-transcribe" });
  });
});

describe("choosing a real provider by name", () => {
  it("fails with the missing key's name, and only for the provider that was chosen", () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => getSttProvider({ STT_PROVIDER: "deepgram" })).toThrow(/DEEPGRAM_API_KEY/);
    expect(() => getSttProvider({ STT_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
    expect(() => getSttProvider({ STT_PROVIDER: "mock" })).not.toThrow();
  });

  it("returns a consent-guarded provider that keeps its model name", () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "k");
    const provider = getSttProvider({ STT_PROVIDER: "deepgram" });
    expect(provider).toMatchObject({ name: "deepgram", model: "nova-3", pricing: { usdPerAudioMinute: DEEPGRAM_USD_PER_MINUTE } });
    expect(() => provider.transcribe({ ...request, consentVersion: "" })).toThrow(/consent/);
  });
});
