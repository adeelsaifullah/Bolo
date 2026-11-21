import { describe, expect, it } from "vitest";
import { createLogger, isSensitiveKey, redact, redactString, type LogLevel } from "./index";

function capture(level?: LogLevel) {
  const lines: { level: LogLevel; entry: Record<string, unknown>; raw: string }[] = [];
  const logger = createLogger({
    level,
    now: () => new Date("2026-11-21T10:00:00.000Z"),
    sink: (lvl, raw) => lines.push({ level: lvl, entry: JSON.parse(raw), raw }),
  });
  return { logger, lines };
}

describe("logger output", () => {
  it("writes one JSON line with time, level, event and data", () => {
    const { logger, lines } = capture();
    logger.info("attempt.saved", { attemptId: "a1", costPkr: 2.5 });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.entry).toEqual({
      time: "2026-11-21T10:00:00.000Z",
      level: "info",
      event: "attempt.saved",
      data: { attemptId: "a1", costPkr: 2.5 },
    });
  });

  it("respects the level threshold", () => {
    const { logger, lines } = capture("warn");
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(lines.map((l) => l.entry.event)).toEqual(["c", "d"]);
  });

  it("does not throw on a circular or unserialisable value", () => {
    const { logger, lines } = capture();
    const loop: Record<string, unknown> = { name: "x" };
    loop.self = loop;
    expect(() => logger.info("loop", { loop, big: 10n })).not.toThrow();
    expect(lines[0]?.raw).toContain("[circular]");
    expect(lines[0]?.raw).toContain('"10"');
  });
});

describe("what must never be logged", () => {
  const PHONE = "03001234567";

  it("drops transcripts, audio, phone numbers and screenshots by key name", () => {
    const { logger, lines } = capture();
    logger.info("pipeline.step", {
      transcript: "my name is Ali and I live in Lahore",
      audio: new Uint8Array([1, 2, 3]),
      audioBlob: "AAAA",
      phone: PHONE,
      phoneNumber: PHONE,
      userMobile: PHONE,
      paymentScreenshot: "data:image/png;base64,AAAA",
      screenshotUrl: "https://x/y.png",
      receipt: "r",
      cnic: "35202-1234567-1",
      user_email: "a@b.com",
      email: "a@b.com",
      otp: "123456",
      authorization: "Bearer abc",
      apiKey: "sk-123",
      password: "pw",
      llmPrompt: "tell me",
      messages: [{ role: "user", content: "hello" }],
    });
    const raw = lines[0]!.raw;
    for (const secret of [
      "Ali",
      "Lahore",
      PHONE,
      "AAAA",
      "y.png",
      "35202",
      "a@b.com",
      "123456",
      "Bearer",
      "sk-123",
      "pw",
      "tell me",
      "hello",
    ]) {
      expect(raw).not.toContain(secret);
    }
    expect(raw).toContain("[redacted]");
  });

  it("catches a phone number hiding inside an innocent field", () => {
    const { logger, lines } = capture();
    logger.warn("otp.failed", { note: `could not reach ${PHONE} or +92 300 1234567 or 0092-300-1234567` });
    const raw = lines[0]!.raw;
    expect(raw).not.toContain("1234567");
    expect(raw).toContain("[redacted:phone]");
  });

  it("catches a phone number inside an error message", () => {
    const { logger, lines } = capture();
    logger.error("sms.failed", { error: new Error(`delivery to 923001234567 failed`) });
    expect(lines[0]!.raw).not.toContain("923001234567");
    expect(lines[0]!.entry.data).toEqual({ error: { name: "Error", message: "delivery to [redacted:phone] failed" } });
  });

  it("never prints an error stack", () => {
    const { logger, lines } = capture();
    logger.error("boom", { error: new Error("x") });
    expect(lines[0]!.raw).not.toContain("at ");
  });

  it("redacts binary values wherever they are", () => {
    const { logger, lines } = capture();
    logger.info("upload", {
      chunk: new Uint8Array(10),
      nested: { buf: Buffer.from("secret audio") },
      ab: new ArrayBuffer(4),
      file: new Blob(["x"]),
      list: [new Uint8Array(2)],
    });
    const raw = lines[0]!.raw;
    expect(raw).not.toContain("secret audio");
    expect(raw).toContain("[redacted:binary 10 bytes]");
    expect(raw).toContain("[redacted:binary 12 bytes]");
    expect(raw).toContain("[redacted:binary 4 bytes]");
  });

  it("redacts data: URLs, JWTs and long base64 blobs found in plain fields", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
    const blob = "QUJD".repeat(80);
    const { logger, lines } = capture();
    logger.info("odd", { a: "data:audio/webm;base64,AAAAAAAA", b: `token ${jwt}`, c: blob });
    const raw = lines[0]!.raw;
    expect(raw).not.toContain("eyJhbGci");
    expect(raw).not.toContain("QUJDQUJD");
    expect(raw).not.toContain("AAAAAAAA");
  });

  it("redacts a secret in the event name too", () => {
    const { logger, lines } = capture();
    logger.info(`called ${PHONE}`);
    expect(lines[0]!.raw).not.toContain(PHONE);
  });

  it("keeps harmless measurements under sensitive-looking keys", () => {
    const { logger, lines } = capture();
    logger.info("stt.done", { audioSeconds: 41.5, audioBytes: 123456, transcriptLength: 210, promptTokens: 90, phoneCount: 0 });
    expect(lines[0]!.entry.data).toEqual({
      audioSeconds: 41.5,
      audioBytes: 123456,
      transcriptLength: 210,
      promptTokens: 90,
      phoneCount: 0,
    });
  });

  it("does NOT keep a string under a measurement-like key", () => {
    const { logger, lines } = capture();
    logger.info("x", { transcriptLength: "my private words" });
    expect(lines[0]!.raw).not.toContain("private");
  });

  it("keeps ordinary facts, including cost numbers and ids", () => {
    const { logger, lines } = capture();
    logger.info("attempt.saved", { userId: "u_1", planId: "sprint_14", costUsd: 0.002, costPkr: 0.56, fxPkrPerUsd: 280, ok: true });
    expect(lines[0]!.entry.data).toEqual({
      userId: "u_1",
      planId: "sprint_14",
      costUsd: 0.002,
      costPkr: 0.56,
      fxPkrPerUsd: 280,
      ok: true,
    });
  });
});

describe("redact()", () => {
  it("limits depth, array length and string length", () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    expect(JSON.stringify(redact(deep))).toContain("[max-depth]");
    const arr = redact(Array.from({ length: 50 }, (_, i) => i)) as unknown[];
    expect(arr).toHaveLength(21);
    expect(arr[20]).toBe("[+30 more]");
    expect(redactString("x ".repeat(400))).toMatch(/\.\.\.\[truncated\]$/);
  });

  it("allows the same object twice, flags only real cycles", () => {
    const shared = { n: 1 };
    expect(redact({ a: shared, b: shared })).toEqual({ a: { n: 1 }, b: { n: 1 } });
  });

  it("handles odd values", () => {
    expect(redact(undefined)).toBeUndefined();
    expect(redact(null)).toBeNull();
    expect(redact(Number.NaN)).toBe("NaN");
    expect(redact(() => 1)).toBe("[function]");
    expect(redact(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(redact(new Map([[1, 2]]))).toBe("[Map of 1]");
  });
});

describe("isSensitiveKey", () => {
  it.each(["transcript", "Transcript", "user_transcript", "audioUrl", "phone", "phone_number", "msisdn", "screenshot", "Authorization", "apiKey", "api-key", "otp", "email", "user_email", "sessionToken", "answerText", "access_token"])(
    "%s is sensitive",
    (key) => expect(isSensitiveKey(key)).toBe(true),
  );
  it.each(["attemptId", "costPkr", "planId", "footprint", "durationMs", "status", "errorMessage", "maxOutputTokens"])("%s is not", (key) =>
    expect(isSensitiveKey(key)).toBe(false),
  );
});
