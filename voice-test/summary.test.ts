import { describe, expect, it } from "vitest";
import type { Correction } from "./feedback";
import type { FileResult } from "./results";
import type { Verdict } from "./review";
import { markKey } from "./review";
import { computeStats, judgeG0, renderComparison, renderSummary, type SummaryJson, type Thresholds } from "./summary";

const FX = 280;
const T: Thresholds = {
  minRecordings: 4,
  minSpeakers: 2,
  minCorrectionsRight: 0.9,
  maxWerOverall: 0.2,
  maxWerGroup: 0.25,
  maxCostPkrPerMinute: 2,
  planningCostPkrPerMinute: 1.5,
};

const corrections = (): Correction[] =>
  [1, 2, 3].map((n) => ({ kind: n === 3 ? "polish" : "mistake", said: `SAID-${n}`, better: `BETTER-${n}`, why: `WHY-${n}` }));

/** A finished recording: 60 s of audio, 100 reference words with `errors` errors, STT USD 0.006 and feedback USD 0.002. */
function result(file: string, overrides: Partial<FileResult> = {}, errors = 10): FileResult {
  return {
    file,
    speaker: `speaker-${file}`,
    group: "g1",
    consentVersion: "pilot-v1",
    audioSeconds: 60,
    status: "ok",
    error: null,
    stt: { provider: "p", model: "m", ms: 2000, attempts: 1, costUsd: 0.006, transcript: "SECRET TRANSCRIPT" },
    llm: { provider: "q", model: "n", ms: 3000, attempts: 1, inputTokens: 700, outputTokens: 400, costUsd: 0.002 },
    feedback: { valid: true, recovered: false, error: null, scoreParts: { taskFit: 30, grammar: 18, vocabulary: 14, fluency: 9 }, practiceScore: 71, corrections: corrections() },
    wer: { substitutions: errors, deletions: 0, insertions: 0, refWords: 100 },
    referenceText: "SECRET REFERENCE",
    promptVersion: "v0",
    keys: { stt: "a", feedback: "b" },
    ...overrides,
  };
}

const allRight = (files: string[]): Map<string, Verdict> =>
  new Map(files.flatMap((f) => [1, 2, 3].map((n) => [markKey(f, n), "right" as Verdict] as const)));

describe("statistics", () => {
  it("works out the word error rate overall and per group, worst first", () => {
    const results = [result("a", { group: "g1" }, 10), result("b", { group: "g2" }, 30), result("c", { group: "g1" }, 0)];
    const { wer, speakers } = computeStats(results, new Map(), FX);
    expect(wer.overall).toBeCloseTo(40 / 300, 10);
    expect(wer.groups.map((g) => [g.group, g.files, g.errors, g.refWords])).toEqual([["g2", 1, 30, 100], ["g1", 2, 10, 200]]);
    expect(wer.worst[0]).toMatchObject({ file: "b", wer: 0.3 });
    expect(speakers).toBe(3);
  });

  it("leaves a recording with no reference out of the word error rate", () => {
    const stats = computeStats([result("a"), result("b", { wer: null, referenceText: null, speaker: null, group: null })], new Map(), FX);
    expect(stats.wer.filesWithoutReference).toBe(1);
    expect(stats.wer.refWords).toBe(100);
    expect(stats.speakers).toBe(1);
  });

  it("counts marks, unmarked corrections and the split by kind", () => {
    const marks = new Map<string, Verdict>([[markKey("a", 1), "right"], [markKey("a", 2), "wrong"], [markKey("a", 3), "right"]]);
    const { corrections: c } = computeStats([result("a"), result("b")], marks, FX);
    expect(c).toMatchObject({ shown: 6, right: 2, wrong: 1, unmarked: 3 });
    expect(c.byKind).toEqual([{ kind: "mistake", shown: 4, right: 1, wrong: 1 }, { kind: "polish", shown: 2, right: 1, wrong: 0 }]);
  });

  it("works out cost per minute of recorded audio, in total and by stage", () => {
    const { cost } = computeStats([result("a"), result("b")], new Map(), FX);
    expect(cost.audioMinutes).toBe(2);
    expect(cost.totalUsd).toBeCloseTo(0.016, 10);
    expect(cost.perMinuteUsd).toBeCloseTo(0.008, 10);
    expect(cost.perMinutePkr).toBeCloseTo(0.008 * FX, 10);
    expect(cost.sttPerMinutePkr).toBeCloseTo(0.006 * FX, 10);
    expect(cost.llmPerMinutePkr).toBeCloseTo(0.002 * FX, 10);
    expect(cost.avgInputTokens).toBe(700);
  });

  it("still counts the cost of a recording whose feedback failed, and lists it as failed", () => {
    const failed = result("b", { status: "feedback_failed", error: "the reply was not valid JSON", llm: null, feedback: { valid: false, recovered: false, error: "the reply was not valid JSON", scoreParts: null, practiceScore: null, corrections: [] } });
    const stats = computeStats([result("a"), failed], new Map(), FX);
    expect(stats.cost.audioMinutes).toBe(2);
    expect(stats.cost.totalUsd).toBeCloseTo(0.014, 10);
    expect(stats.failed).toEqual([{ file: "b", status: "feedback_failed", error: "the reply was not valid JSON" }]);
    expect(stats.feedback).toMatchObject({ attempted: 2, valid: 1 });
  });

  it("takes median, 90th percentile and slowest from the speeds", () => {
    const results = Array.from({ length: 10 }, (_, i) => result(`f${i}`, { stt: { provider: "p", model: null, ms: (i + 1) * 1000, attempts: 1, costUsd: 0, transcript: "x" } }));
    expect(computeStats(results, new Map(), FX).latencySeconds.stt).toEqual({ median: 5, p90: 9, max: 10 });
  });
});

describe("G0 item 4: feedback quality", () => {
  const files = ["a", "b", "c", "d"];
  const stats = (errorsEach: number, marks: Map<string, Verdict>, groups: string[] = ["g1", "g1", "g1", "g1"]) =>
    computeStats(files.map((f, i) => result(f, { group: groups[i] ?? "g1" }, errorsEach)), marks, FX);

  it("passes when the word error rate is within limits and 90% or more of the corrections are right", () => {
    const marks = allRight(files);
    const judged = judgeG0(stats(20, marks), T).item4;
    expect(judged.verdict).toBe("PASS"); // exactly 20.0% overall is allowed
    expect(judged.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("fails when the overall word error rate is above 20%", () => {
    expect(judgeG0(stats(21, allRight(files)), T).item4.verdict).toBe("FAIL");
  });

  it("fails when one speaker group is above 25%, even if the overall rate is fine", () => {
    const results = [result("a", { group: "g1" }, 0), result("b", { group: "g1" }, 0), result("c", { group: "g1" }, 0), result("d", { group: "g2" }, 26)];
    const judged = judgeG0(computeStats(results, allRight(files), FX), T).item4;
    expect(judged.verdict).toBe("FAIL");
    expect(judged.checks.map((c) => c.text).join(" ")).toMatch(/g2 26\.0%/);
  });

  it("allows a group at exactly 25%", () => {
    const results = [result("a", { group: "g1" }, 0), result("b", { group: "g2" }, 25), result("c", { group: "g1" }, 0), result("d", { group: "g1" }, 0)];
    expect(judgeG0(computeStats(results, allRight(files), FX), T).item4.verdict).toBe("PASS");
  });

  it("needs 90% of all corrections right: 11 of 12 passes, 10 of 12 fails", () => {
    const withWrong = (n: number) => {
      const marks = allRight(files);
      [...marks.keys()].slice(0, n).forEach((k) => marks.set(k, "wrong"));
      return judgeG0(stats(0, marks), T).item4;
    };
    expect(withWrong(1).verdict).toBe("PASS");
    expect(withWrong(2).verdict).toBe("FAIL");
  });

  it("is pending while corrections are unmarked, but a failing word error rate already fails it", () => {
    expect(judgeG0(stats(0, new Map()), T).item4.verdict).toBe("PENDING");
    expect(judgeG0(stats(0, new Map()), T).item4.checks.at(-1)?.text).toMatch(/None of the 12 corrections/);
    expect(judgeG0(stats(40, new Map()), T).item4.verdict).toBe("FAIL");
  });

  it("is pending when there are no reference transcripts", () => {
    const noRefs = computeStats(files.map((f) => result(f, { wer: null, referenceText: null })), allRight(files), FX);
    expect(judgeG0(noRefs, T).item4.verdict).toBe("PENDING");
  });
});

describe("G0 item 5: cost", () => {
  const withCost = (sttUsd: number, llmUsd: number) =>
    judgeG0(computeStats([result("a", { stt: { provider: "p", model: null, ms: 1, attempts: 1, costUsd: sttUsd, transcript: "x" }, llm: { provider: "q", model: null, ms: 1, attempts: 1, inputTokens: 1, outputTokens: 1, costUsd: llmUsd } })], new Map(), FX), T).item5;

  it("passes at or under PKR 2.00 per minute and fails above it", () => {
    const limitUsd = 2 / FX; // one minute of audio, so this is the whole cost
    expect(withCost(limitUsd * 0.6, limitUsd * 0.4).verdict).toBe("PASS");
    expect(withCost(limitUsd * 0.6, limitUsd * 0.41).verdict).toBe("FAIL");
  });

  it("is pending when no audio was processed", () => {
    expect(judgeG0(computeStats([], new Map(), FX), T).item5.verdict).toBe("PENDING");
  });
});

describe("sample size", () => {
  it("says what is missing when there are too few recordings or speakers", () => {
    const small = judgeG0(computeStats([result("a"), result("b")], new Map(), FX), T).sample;
    expect(small.ok).toBe(false);
    expect(small.notes).toEqual(["2 recordings processed, 4 needed"]);
    const enough = judgeG0(computeStats(["a", "b", "c", "d"].map((f) => result(f)), new Map(), FX), T).sample;
    expect(enough.ok).toBe(true);
  });
});

describe("the written summary", () => {
  const build = (): SummaryJson => {
    const stats = computeStats(["a", "b", "c", "d"].map((f) => result(f)), allRight(["a", "b", "c", "d"]), FX);
    return {
      meta: {
        combo: "stt-p-m__llm-q-n", stt: { provider: "p", model: "m" }, llm: { provider: "q", model: "n" }, promptVersion: "v0", script: "roman", fxPkrPerUsd: FX,
        generatedAt: "2026-11-21T00:00:00.000Z", refused: [{ file: "x.wav", reason: "no consent" }], warnings: ["a warning"], invalidMarks: [], clearedMarks: 0, callsMade: 4, reused: 0,
        prices: { sttUsdPerMinute: 0.0043, llmUsdPerMillionInput: 0.75, llmUsdPerMillionOutput: 4.5 },
      },
      thresholds: T,
      stats,
      verdicts: judgeG0(stats, T),
    };
  };

  it("ends with the G0 item 4 and item 5 verdicts", () => {
    const text = renderSummary(build());
    expect(text.indexOf("## G0 items 4 and 5")).toBeGreaterThan(text.indexOf("## Failed files"));
    expect(text.split("## G0 items 4 and 5")[1]).toContain("**Item 4, feedback quality: PASS**");
    expect(text.split("## G0 items 4 and 5")[1]).toContain("**Item 5, cost: FAIL**"); // 0.008 USD x 280 = PKR 2.24 per minute
    expect(text.trimEnd().endsWith("Sample size: OK.")).toBe(true);
  });

  it("never contains a transcript, a reference or a correction", () => {
    const text = renderSummary(build()) + renderComparison([build()]);
    for (const secret of ["SECRET TRANSCRIPT", "SECRET REFERENCE", "SAID-1", "BETTER-1", "WHY-1"]) expect(text).not.toContain(secret);
  });

  it("explains how the cost is counted and tells you to check the dashboards", () => {
    const text = renderSummary(build());
    expect(text).toContain("per minute of the learner's recorded audio");
    expect(text).toContain("Compare the total above with what the provider dashboards show");
  });

  it("prints the unit prices the costs were worked out with, or says there are none", () => {
    expect(renderSummary(build())).toContain("Unit prices used: speech-to-text USD 0.0043 per audio minute; feedback USD 0.75 in / 4.5 out per million tokens.");
    const mock = build();
    mock.meta.prices = { sttUsdPerMinute: null, llmUsdPerMillionInput: null, llmUsdPerMillionOutput: null };
    expect(renderSummary(mock)).toContain("Unit prices used: none (mock providers).");
  });

  it("lists every combination in the comparison", () => {
    const other = build();
    other.meta.stt = { provider: "z", model: null };
    const text = renderComparison([build(), other]);
    expect(text).toContain("| p (m) + q (n) · v0 |");
    expect(text).toContain("| z + q (n) · v0 |");
  });
});
