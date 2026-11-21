import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LlmProvider, LlmRequest } from "@/lib/llm";
import { ProviderError } from "@/lib/providers/errors";
import { tokenCostUsd } from "@/lib/providers/pricing";
import { withConsentGuard } from "@/lib/stt";
import { FEEDBACK_PROMPT_FILE } from "./feedback";
import { comboName, runVoiceTest, type RunDeps, type RunOptions } from "./run";
import type { SummaryJson, Thresholds } from "./summary";
import { makeRecordingsDir, REPO_ROOT, removeTempDirs, tempDir } from "./test-helpers";

afterEach(removeTempDirs);

const T: Thresholds = { minRecordings: 3, minSpeakers: 3, minCorrectionsRight: 0.9, maxWerOverall: 0.2, maxWerGroup: 0.25, maxCostPkrPerMinute: 2, planningCostPkrPerMinute: 1.5 };
const FX = 280;

const FILES = { "a.wav": 2, "b.wav": 3, "c.wav": 4, "refused.wav": 2 };
const CONSENT = "file,consent_version,date\na.wav,pilot-v1,2026-11-20\nb.wav,pilot-v1,2026-11-20\nc.wav,pilot-v1,2026-11-20\n";
const REFERENCE =
  "file,speaker,speaker_group,reference_transcript,prompt\n" +
  "a.wav,s1,g1,hello world,Introduce yourself\n" +
  "b.wav,s2,g2,good morning to you,\n" +
  "c.wav,s3,g1,thank you very much,\n";
// What the fake speech-to-text hears, by length in seconds. b.wav loses one word of four (25%).
const HEARD: Record<number, string> = { 2: "hello world", 3: "good morning you", 4: "thank you very much" };

const goodFeedback = (suffix = "") =>
  JSON.stringify({
    score_parts: { task_fit: 30, grammar: 18, vocabulary: 14, fluency: 9 },
    corrections: [1, 2, 3].map((n) => ({ kind: n === 3 ? "polish" : "mistake", said: `said ${n}${suffix}`, better: `better ${n}${suffix}`, why: `why ${n}` })),
  });

class Harness {
  sttCalls: { seconds: number; consentVersion: string }[] = [];
  llmCalls: LlmRequest[] = [];
  sleeps: number[] = [];
  lines: string[] = [];
  sttFailure: ((callNumber: number) => Error | null) | null = null;
  llmText = goodFeedback();
  /** The prices the fake providers charge and publish. A test can change them between runs. */
  sttUsdPerMinute = 0.003;
  llmUsdPerMillion = { input: 0.2, output: 0.2 };
  heard: Record<number, string> = { ...HEARD };

  constructor(
    readonly dir: string,
    readonly resultsRoot: string,
    readonly promptRoot = REPO_ROOT,
  ) {}

  deps(): RunDeps {
    let tick = 0;
    const llm: LlmProvider = {
      name: "fakellm",
      model: "l1",
      pricing: { usdPerMillionInput: this.llmUsdPerMillion.input, usdPerMillionOutput: this.llmUsdPerMillion.output },
      complete: async (request) => {
        this.llmCalls.push(request);
        const costUsd = tokenCostUsd(500, 300, this.llmUsdPerMillion.input, this.llmUsdPerMillion.output);
        return { provider: "fakellm", costUsd, text: this.llmText, inputTokens: 500, outputTokens: 300 };
      },
    };
    return {
      stt: withConsentGuard({
        name: "fakestt",
        model: "s1",
        pricing: { usdPerAudioMinute: this.sttUsdPerMinute },
        transcribe: async (request) => {
          this.sttCalls.push({ seconds: request.audioSeconds ?? 0, consentVersion: request.consentVersion });
          const failure = this.sttFailure?.(this.sttCalls.length);
          if (failure) throw failure;
          const seconds = request.audioSeconds ?? 0;
          return { provider: "fakestt", costUsd: (seconds / 60) * this.sttUsdPerMinute, transcript: this.heard[Math.round(seconds)] ?? "", audioSeconds: seconds };
        },
      }),
      llm,
      fxPkrPerUsd: FX,
      thresholds: T,
      write: (line) => this.lines.push(line),
      now: () => new Date("2026-11-21T00:00:00.000Z"),
      clock: () => (tick += 250),
      sleep: async (ms) => void this.sleeps.push(ms),
    };
  }

  options(overrides: Partial<RunOptions> = {}): RunOptions {
    return { recordingsDir: this.dir, resultsRoot: this.resultsRoot, promptRoot: this.promptRoot, script: "roman", limit: null, dryRun: false, fresh: false, ...overrides };
  }

  run(overrides: Partial<RunOptions> = {}) {
    return runVoiceTest(this.options(overrides), this.deps());
  }

  get comboDir(): string {
    return join(this.resultsRoot, comboName({ name: "fakestt", model: "s1" }, { name: "fakellm", model: "l1" }));
  }

  async summary(): Promise<SummaryJson> {
    return JSON.parse(await readFile(join(this.comboDir, "summary.json"), "utf8")) as SummaryJson;
  }
}

async function harness(files: Record<string, number> = FILES, consent = CONSENT, reference = REFERENCE): Promise<Harness> {
  return new Harness(await makeRecordingsDir(files, consent, reference), join(await tempDir(), "results"));
}

describe("a full run", () => {
  it("sends only recordings with a stored consent version, and passes that version to the provider", async () => {
    const h = await harness();
    await h.run();
    expect(h.sttCalls).toHaveLength(3); // refused.wav has no consent row and was never sent
    expect(h.sttCalls.every((c) => c.consentVersion === "pilot-v1")).toBe(true);
    expect(h.lines.join("\n")).toContain("REFUSED refused.wav: no row in consent.csv");
  });

  it("writes the results, the review sheet, the summary and the comparison", async () => {
    const h = await harness();
    const outcome = await h.run();
    expect(outcome.stoppedEarly).toBeNull();
    for (const name of ["results.csv", "corrections_review.csv", "summary.md", "summary.json"]) expect(existsSync(join(h.comboDir, name))).toBe(true);
    expect(existsSync(join(h.resultsRoot, "comparison.md"))).toBe(true);

    const { stats, verdicts, meta } = await h.summary();
    expect(stats.recordingsProcessed).toBe(3);
    expect(stats.wer.overall).toBeCloseTo(1 / 10, 10);
    expect(stats.cost.perMinuteUsd).toBeCloseTo(0.003 + (3 * tokenCostUsd(500, 300, 0.2, 0.2)) / 0.15, 10); // speech 0.003 a minute + 3 feedback calls over 0.15 minutes
    expect(verdicts.item5.verdict).toBe("PASS"); // about PKR 1.7 per minute
    expect(verdicts.item4.verdict).toBe("PENDING"); // word error rates are fine, nothing is marked yet
    expect(meta).toMatchObject({ callsMade: 3, reused: 0, promptVersion: "voice-test-feedback.v0" });
  });

  it("gives the LLM only text, with the task from reference.csv", async () => {
    const h = await harness();
    await h.run();
    const first = h.llmCalls[0]!;
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0]?.content).toContain("Task: Introduce yourself");
    expect(first.messages[0]?.content).toContain("hello world");
    expect(first.responseFormat).toBe("json");
  });

  it("never prints a transcript, a reference or a correction", async () => {
    const h = await harness();
    await h.run();
    const output = h.lines.join("\n");
    for (const secret of ["hello world", "good morning", "thank you very much", "said 1", "better 1"]) expect(output).not.toContain(secret);
  });

  it("times each stage and records the cost of each", async () => {
    const h = await harness();
    await h.run();
    const saved = JSON.parse(await readFile(join(h.comboDir, "files", "a.wav.json"), "utf8")) as { stt: { ms: number; costUsd: number }; llm: { ms: number } };
    expect(saved.stt.ms).toBe(250);
    expect(saved.llm.ms).toBe(250);
    expect(saved.stt.costUsd).toBeCloseTo((2 / 60) * 0.003, 10);
    const csv = await readFile(join(h.comboDir, "results.csv"), "utf8");
    expect(csv.split("\n")[0]).toContain("stt_cost_usd");
    expect(csv).toContain("hello world"); // results.csv stays on this computer and is git-ignored
  });

  it("skips feedback when the speech-to-text hears nothing, and counts it as failed", async () => {
    const h = await harness();
    h.heard[2] = "";
    await h.run();
    expect(h.llmCalls).toHaveLength(2);
    const { stats } = await h.summary();
    expect(stats.failed).toEqual([{ file: "a.wav", status: "feedback_failed", error: "empty transcript, feedback skipped" }]);
    expect(stats.wer.errors).toBeGreaterThanOrEqual(2); // everything in a.wav's reference was missed
  });

  it("records an unusable feedback reply as a failure and carries on", async () => {
    const h = await harness();
    h.llmText = "Sorry, I cannot do that.";
    const outcome = await h.run();
    expect(outcome.stoppedEarly).toBeNull(); // three failures in a row, but on the last file: nothing was skipped
    const { stats } = await h.summary();
    expect(stats.failed.map((f) => f.error)).toEqual(Array(3).fill("the reply was not valid JSON"));
    expect(stats.cost.totalUsd).toBeGreaterThan(0); // the money was still spent
  });
});

describe("saved results", () => {
  const markEverythingRight = async (h: Harness) => {
    const path = join(h.comboDir, "corrections_review.csv");
    await writeFile(path, (await readFile(path, "utf8")).replace(/^([^,\n]+,[123]),,/gm, "$1,right,"));
  };

  it("are reused on the next run, so nothing is sent or billed again", async () => {
    const h = await harness();
    await h.run();
    await h.run();
    expect(h.sttCalls).toHaveLength(3);
    expect(h.llmCalls).toHaveLength(3);
    expect(h.lines.join("\n")).toContain("(saved result reused)");
    expect((await h.summary()).meta).toMatchObject({ callsMade: 0, reused: 3 });
  });

  it("are re-priced when a unit price changes, with nothing sent and the marks kept", async () => {
    const h = await harness();
    await h.run();
    await markEverythingRight(h);
    const before = (await h.summary()).stats.cost;

    h.sttUsdPerMinute = 0.006;
    h.llmUsdPerMillion = { input: 0.4, output: 0.4 };
    await h.run();
    const after = await h.summary();

    expect(after.stats.cost.sttUsd).toBeCloseTo(before.sttUsd * 2, 10);
    expect(after.stats.cost.llmUsd).toBeCloseTo(before.llmUsd * 2, 10);
    expect(after.meta.prices).toEqual({ sttUsdPerMinute: 0.006, llmUsdPerMillionInput: 0.4, llmUsdPerMillionOutput: 0.4 });
    expect(after.stats.corrections).toMatchObject({ right: 9, unmarked: 0 });
    expect(h.sttCalls).toHaveLength(3);
    expect(h.llmCalls).toHaveLength(3);
  });

  it("are ignored with --fresh", async () => {
    const h = await harness();
    await h.run();
    await h.run({ fresh: true });
    expect(h.sttCalls).toHaveLength(6);
  });

  it("let the founder's marks turn item 4 from pending to pass without a new provider call", async () => {
    const h = await harness();
    await h.run();
    expect((await h.summary()).verdicts.item4.verdict).toBe("PENDING");
    await markEverythingRight(h);
    await h.run();
    const { verdicts, stats } = await h.summary();
    expect(stats.corrections).toMatchObject({ shown: 9, right: 9, unmarked: 0 });
    expect(verdicts.item4.verdict).toBe("PASS");
    expect(h.sttCalls).toHaveLength(3);
  });

  it("clear a mark when a re-run produces a different correction, and say so", async () => {
    const h = await harness();
    await h.run();
    await markEverythingRight(h);
    h.llmText = goodFeedback(" changed");
    await h.run({ fresh: true });
    const { meta, stats } = await h.summary();
    expect(meta.clearedMarks).toBe(9);
    expect(stats.corrections.unmarked).toBe(9);
  });

  it("redo only the feedback when the prompt file is edited, keeping the paid speech-to-text", async () => {
    const promptRoot = await tempDir();
    await mkdir(join(promptRoot, "prompts"), { recursive: true });
    await cp(join(REPO_ROOT, FEEDBACK_PROMPT_FILE), join(promptRoot, FEEDBACK_PROMPT_FILE));
    const h = new Harness(await makeRecordingsDir(FILES, CONSENT, REFERENCE), join(await tempDir(), "results"), promptRoot);
    await h.run();
    await writeFile(join(promptRoot, FEEDBACK_PROMPT_FILE), (await readFile(join(promptRoot, FEEDBACK_PROMPT_FILE), "utf8")) + "\nBe brief.\n");
    await h.run();
    expect(h.sttCalls).toHaveLength(3);
    expect(h.llmCalls).toHaveLength(6);
  });
});

describe("when a provider has trouble", () => {
  it("tries again after a busy reply, waiting longer each time, and records the extra attempt", async () => {
    const h = await harness();
    h.sttFailure = (n) => (n <= 2 ? new ProviderError("fakestt", 503, "busy") : null);
    await h.run();
    expect(h.sleeps).toEqual([1000, 2000]);
    const saved = JSON.parse(await readFile(join(h.comboDir, "files", "a.wav.json"), "utf8")) as { stt: { attempts: number }; status: string };
    expect(saved).toMatchObject({ status: "ok", stt: { attempts: 3 } });
  });

  it("does not retry a reply that will never work, such as a bad request", async () => {
    const h = await harness();
    h.sttFailure = () => new ProviderError("fakestt", 400, "bad audio");
    await h.run();
    expect(h.sleeps).toEqual([]);
    expect(h.sttCalls).toHaveLength(3);
  });

  it("stops at once when the key is refused, before anything else is sent", async () => {
    const h = await harness();
    h.sttFailure = () => new ProviderError("fakestt", 401, "Invalid credentials.");
    const outcome = await h.run();
    expect(outcome.stoppedEarly).toMatch(/refused the key/);
    expect(h.sttCalls).toHaveLength(1);
    expect(h.lines.join("\n")).toContain("STOPPED:");
  });

  it("stops after three recordings in a row fail, so a wrong model name does not run up 40 failures", async () => {
    const files = { "a.wav": 2, "b.wav": 3, "c.wav": 4, "d.wav": 2, "e.wav": 3 };
    const consent = "file,consent_version,date\n" + Object.keys(files).map((f) => `${f},pilot-v1,2026-11-20`).join("\n") + "\n";
    const reference = "file,speaker,speaker_group,reference_transcript\n" + Object.keys(files).map((f, i) => `${f},s${i},g1,hello`).join("\n") + "\n";
    const h = await harness(files, consent, reference);
    h.sttFailure = () => new ProviderError("fakestt", 404, "model not found");
    const outcome = await h.run();
    expect(outcome.stoppedEarly).toMatch(/3 recordings in a row failed/);
    expect(h.sttCalls).toHaveLength(3);
  });
});

describe("a dry run and a limited run", () => {
  it("checks the files and sends nothing, writing nothing", async () => {
    const h = await harness();
    const outcome = await h.run({ dryRun: true });
    expect(outcome.comboDir).toBeNull();
    expect(h.sttCalls).toHaveLength(0);
    expect(h.llmCalls).toHaveLength(0);
    expect(existsSync(h.resultsRoot)).toBe(false);
    expect(h.lines.join("\n")).toMatch(/Dry run: 3 recording\(s\), \d+\.\d minutes of audio\. Nothing was sent\./);
  });

  it("sends only the first n recordings", async () => {
    const h = await harness();
    await h.run({ limit: 1 });
    expect(h.sttCalls).toHaveLength(1);
    expect((await h.summary()).stats.recordingsProcessed).toBe(1);
  });

  it("does nothing, and says so, when no recording has a stored consent version", async () => {
    const h = await harness({ "a.wav": 2 }, "file,consent_version,date\na.wav,,2026-11-20\n", REFERENCE);
    const outcome = await h.run();
    expect(outcome.summary).toBeNull();
    expect(h.sttCalls).toHaveLength(0);
    expect(h.lines.join("\n")).toContain("Nothing to run.");
  });
});
