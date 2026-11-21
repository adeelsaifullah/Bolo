import { describe, expect, it } from "vitest";
import { ConfigError } from "@/lib/config";
import { getLlmProvider } from "@/lib/llm";
import { getPaymentProvider } from "@/lib/payments";
import { assertConsent } from "@/lib/providers/consent";
import { selectProvider } from "@/lib/providers/select";
import { getSttProvider, withConsentGuard } from "@/lib/stt";
import { getTtsProvider } from "@/lib/tts";

describe("selectProvider", () => {
  const registry = { mock: () => "M", other: () => "O" };

  it("uses the default when the env var is unset", () => {
    expect(selectProvider({ envName: "X_PROVIDER", defaultName: "mock", registry, env: {} })).toBe("M");
  });

  it("uses the name in the env var", () => {
    expect(selectProvider({ envName: "X_PROVIDER", defaultName: "mock", registry, env: { X_PROVIDER: " other " } })).toBe("O");
  });

  it("throws a clear error for an unknown name, listing the choices", () => {
    const run = () => selectProvider({ envName: "X_PROVIDER", defaultName: "mock", registry, env: { X_PROVIDER: "openai" } });
    expect(run).toThrow(ConfigError);
    expect(run).toThrow(/"openai" is not a registered provider.*mock, other/);
  });

  it("refuses to fall back to the default in production", () => {
    const run = () => selectProvider({ envName: "X_PROVIDER", defaultName: "mock", registry, env: { NODE_ENV: "production" } });
    expect(run).toThrow(/X_PROVIDER/);
  });

  it("accepts an explicit choice in production", () => {
    expect(selectProvider({ envName: "X_PROVIDER", defaultName: "mock", registry, env: { NODE_ENV: "production", X_PROVIDER: "mock" } })).toBe("M");
  });
});

describe("mock providers (chosen by env name, no network)", () => {
  it("stt: mock transcribes and reports zero cost", async () => {
    const stt = getSttProvider({ STT_PROVIDER: "mock" });
    const result = await stt.transcribe({ audio: new Uint8Array(64000), mimeType: "audio/webm", language: "en", consentVersion: "v1" });
    expect(result).toMatchObject({ provider: "mock", costUsd: 0, audioSeconds: 2 });
    expect(result.transcript).not.toBe("");
  });

  it("llm: mock completes and reports tokens and zero cost", async () => {
    const result = await getLlmProvider({ LLM_PROVIDER: "mock" }).complete({
      system: "be brief",
      messages: [{ role: "user", content: "hello" }],
      maxOutputTokens: 50,
    });
    expect(result).toMatchObject({ provider: "mock", costUsd: 0, outputTokens: 3 });
    expect(result.inputTokens).toBeGreaterThan(0);
  });

  it("tts: mock returns a valid WAV", async () => {
    const result = await getTtsProvider({ TTS_PROVIDER: "mock" }).synthesize({ text: "hello", language: "en" });
    expect(result).toMatchObject({ provider: "mock", costUsd: 0, mimeType: "audio/wav" });
    const header = new TextDecoder().decode(result.audio.slice(0, 4)) + new TextDecoder().decode(result.audio.slice(8, 12));
    expect(header).toBe("RIFFWAVE");
    const dataBytes = new DataView(result.audio.buffer).getUint32(40, true);
    expect(result.audio.byteLength).toBe(44 + dataBytes);
  });

  it("each kind rejects an unknown provider name", () => {
    expect(() => getSttProvider({ STT_PROVIDER: "x" })).toThrow(/STT_PROVIDER/);
    expect(() => getLlmProvider({ LLM_PROVIDER: "x" })).toThrow(/LLM_PROVIDER/);
    expect(() => getTtsProvider({ TTS_PROVIDER: "x" })).toThrow(/TTS_PROVIDER/);
    expect(() => getPaymentProvider({ PAYMENTS_PROVIDER: "x" })).toThrow(/PAYMENTS_PROVIDER/);
  });
});

describe("consent guard (audio never goes to a provider without a stored consent version)", () => {
  const request = (consentVersion: string) => ({ audio: new Uint8Array(1), mimeType: "audio/webm", language: "en", consentVersion });

  it.each(["", "   "])("blocks %j and never reaches the inner provider", (version) => {
    let reached = false;
    const guarded = withConsentGuard({
      name: "spy",
      async transcribe() {
        reached = true;
        return { provider: "spy", costUsd: 0, transcript: "", audioSeconds: 0 };
      },
    });
    expect(() => guarded.transcribe(request(version))).toThrow(ConfigError);
    expect(() => guarded.transcribe(request(version))).toThrow(/consent/);
    expect(reached).toBe(false);
  });

  it("passes through to the inner provider when a consent version is stored", async () => {
    let reached = false;
    const guarded = withConsentGuard({
      name: "spy",
      async transcribe() {
        reached = true;
        return { provider: "spy", costUsd: 0, transcript: "ok", audioSeconds: 1 };
      },
    });
    await expect(guarded.transcribe(request("2026-11-v1"))).resolves.toMatchObject({ transcript: "ok" });
    expect(reached).toBe(true);
  });

  it("the provider returned by getSttProvider is guarded", () => {
    expect(() => getSttProvider({ STT_PROVIDER: "mock" }).transcribe(request(""))).toThrow(/consent/);
  });

  it("assertConsent rejects null and undefined", () => {
    expect(() => assertConsent(null)).toThrow(/consent/);
    expect(() => assertConsent(undefined)).toThrow(/consent/);
    expect(() => assertConsent("2026-11-v1")).not.toThrow();
  });
});

describe("payments", () => {
  const request = { reference: "ref_1", userId: "u1", planId: "sprint_14", amountPkr: 499 };

  it("defaults to the manual flow: no money moves, waits for approval", async () => {
    const payments = getPaymentProvider({});
    expect(payments).toMatchObject({ name: "manual", mode: "manual" });
    expect(await payments.startPayment(request)).toEqual({
      provider: "manual",
      status: "awaiting_manual_approval",
      providerPaymentId: null,
      feePkr: 0,
    });
    expect((await payments.refund({ reference: "ref_1", amountPkr: 499, reason: "test" })).status).toBe("manual_refund_required");
  });

  it.each([0, -499, 499.5, Number.NaN])("manual rejects amount %s", async (amountPkr) => {
    await expect(getPaymentProvider({}).startPayment({ ...request, amountPkr })).rejects.toThrow(/whole number of PKR/);
  });

  it("mock gateway confirms instantly", async () => {
    const payments = getPaymentProvider({ PAYMENTS_PROVIDER: "mock" });
    expect(payments.mode).toBe("gateway");
    expect(await payments.startPayment(request)).toMatchObject({ status: "paid", providerPaymentId: "mock_ref_1" });
    expect((await payments.refund({ reference: "ref_1", amountPkr: 499, reason: "test" })).status).toBe("refunded");
  });
});
