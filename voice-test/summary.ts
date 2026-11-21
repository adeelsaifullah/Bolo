import { fileCostUsd, type FileResult } from "./results";
import { markKey, type Verdict } from "./review";
import { totalErrors } from "./wer";
import type { Refusal } from "./inputs";

/** The G0 numbers the voice test checks. They come from config/app.json (gates.g0 and economics), never from here. */
export interface Thresholds {
  minRecordings: number;
  minSpeakers: number;
  minCorrectionsRight: number;
  maxWerOverall: number;
  maxWerGroup: number;
  maxCostPkrPerMinute: number;
  planningCostPkrPerMinute: number;
}

export interface Percentiles {
  median: number | null;
  p90: number | null;
  max: number | null;
}

export interface GroupWer {
  group: string;
  files: number;
  refWords: number;
  errors: number;
  wer: number;
}

export interface KindQuality {
  kind: string;
  shown: number;
  right: number;
  wrong: number;
}

export interface Stats {
  recordingsProcessed: number;
  speakers: number;
  failed: { file: string; status: string; error: string }[];
  wer: {
    overall: number | null;
    refWords: number;
    errors: number;
    groups: GroupWer[];
    worst: { file: string; group: string; wer: number }[];
    filesWithoutReference: number;
  };
  corrections: { shown: number; right: number; wrong: number; unmarked: number; byKind: KindQuality[] };
  feedback: { attempted: number; valid: number; recovered: number };
  cost: {
    audioMinutes: number;
    sttUsd: number;
    llmUsd: number;
    totalUsd: number;
    perMinuteUsd: number | null;
    perMinutePkr: number | null;
    sttPerMinutePkr: number | null;
    llmPerMinutePkr: number | null;
    avgInputTokens: number | null;
    avgOutputTokens: number | null;
  };
  latencySeconds: { stt: Percentiles; feedback: Percentiles; total: Percentiles };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

function percentiles(valuesMs: number[]): Percentiles {
  const sorted = valuesMs.map((ms) => ms / 1000).sort((a, b) => a - b);
  return { median: percentile(sorted, 50), p90: percentile(sorted, 90), max: sorted.at(-1) ?? null };
}

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

export function computeStats(results: readonly FileResult[], marks: ReadonlyMap<string, Verdict>, fxPkrPerUsd: number): Stats {
  const processed = results.filter((r) => r.stt !== null);

  // --- word error rate ---
  const withWer = processed.filter((r) => r.wer !== null);
  const errors = sum(withWer.map((r) => totalErrors(r.wer!)));
  const refWords = sum(withWer.map((r) => r.wer!.refWords));
  const byGroup = new Map<string, { files: number; refWords: number; errors: number }>();
  for (const r of withWer) {
    const key = r.group && r.group !== "" ? r.group : "(no group)";
    const g = byGroup.get(key) ?? { files: 0, refWords: 0, errors: 0 };
    g.files += 1;
    g.refWords += r.wer!.refWords;
    g.errors += totalErrors(r.wer!);
    byGroup.set(key, g);
  }
  const groups = [...byGroup.entries()]
    .map(([group, g]) => ({ group, ...g, wer: g.errors / g.refWords }))
    .sort((a, b) => b.wer - a.wer);
  const worst = withWer
    .map((r) => ({ file: r.file, group: r.group ?? "", wer: totalErrors(r.wer!) / r.wer!.refWords }))
    .sort((a, b) => b.wer - a.wer)
    .slice(0, 5);
  const speakers = new Set(processed.filter((r) => r.wer !== null && r.speaker).map((r) => r.speaker!)).size;

  // --- correction quality (the founder's marks) ---
  const kinds = new Map<string, KindQuality>();
  let right = 0;
  let wrong = 0;
  let shown = 0;
  for (const r of results) {
    if (!r.feedback?.valid) continue;
    r.feedback.corrections.forEach((c, i) => {
      shown += 1;
      const entry = kinds.get(c.kind) ?? { kind: c.kind, shown: 0, right: 0, wrong: 0 };
      entry.shown += 1;
      const mark = marks.get(markKey(r.file, i + 1));
      if (mark === "right") {
        right += 1;
        entry.right += 1;
      } else if (mark === "wrong") {
        wrong += 1;
        entry.wrong += 1;
      }
      kinds.set(c.kind, entry);
    });
  }

  // --- feedback reliability ---
  const attempted = processed.filter((r) => r.feedback !== null && r.feedback.error !== "empty transcript, feedback skipped");
  const valid = attempted.filter((r) => r.feedback!.valid);

  // --- cost, per minute of recorded audio ---
  const audioMinutes = sum(processed.map((r) => r.audioSeconds ?? 0)) / 60;
  const sttUsd = sum(results.map((r) => r.stt?.costUsd ?? 0));
  const llmUsd = sum(results.map((r) => r.llm?.costUsd ?? 0));
  const totalUsd = sum(results.map(fileCostUsd));
  const perMinute = (usd: number): number | null => (audioMinutes > 0 ? (usd / audioMinutes) * fxPkrPerUsd : null);
  const llmCalls = results.filter((r) => r.llm !== null);

  return {
    recordingsProcessed: processed.length,
    speakers,
    failed: results
      .filter((r) => r.status !== "ok")
      .map((r) => ({ file: r.file, status: r.status, error: r.error ?? r.feedback?.error ?? "unknown reason" })),
    wer: {
      overall: refWords > 0 ? errors / refWords : null,
      refWords,
      errors,
      groups,
      worst,
      filesWithoutReference: processed.length - withWer.length,
    },
    corrections: { shown, right, wrong, unmarked: shown - right - wrong, byKind: [...kinds.values()] },
    feedback: { attempted: attempted.length, valid: valid.length, recovered: valid.filter((r) => r.feedback!.recovered).length },
    cost: {
      audioMinutes,
      sttUsd,
      llmUsd,
      totalUsd,
      perMinuteUsd: audioMinutes > 0 ? totalUsd / audioMinutes : null,
      perMinutePkr: perMinute(totalUsd),
      sttPerMinutePkr: perMinute(sttUsd),
      llmPerMinutePkr: perMinute(llmUsd),
      avgInputTokens: llmCalls.length > 0 ? sum(llmCalls.map((r) => r.llm!.inputTokens)) / llmCalls.length : null,
      avgOutputTokens: llmCalls.length > 0 ? sum(llmCalls.map((r) => r.llm!.outputTokens)) / llmCalls.length : null,
    },
    latencySeconds: {
      stt: percentiles(results.flatMap((r) => (r.stt ? [r.stt.ms] : []))),
      feedback: percentiles(results.flatMap((r) => (r.llm ? [r.llm.ms] : []))),
      total: percentiles(results.flatMap((r) => (r.stt && r.llm ? [r.stt.ms + r.llm.ms] : []))),
    },
  };
}

export type VerdictLabel = "PASS" | "FAIL" | "PENDING";

export interface Check {
  status: "ok" | "fail" | "pending";
  text: string;
}

export interface Judgement {
  verdict: VerdictLabel;
  checks: Check[];
}

export interface G0Verdicts {
  item4: Judgement;
  item5: Judgement;
  sample: { ok: boolean; notes: string[] };
}

const pct = (value: number, places = 1): string => `${(value * 100).toFixed(places)}%`;

function toVerdict(checks: Check[]): VerdictLabel {
  if (checks.some((c) => c.status === "fail")) return "FAIL";
  if (checks.some((c) => c.status === "pending")) return "PENDING";
  return "PASS";
}

/** G0 item 4 (feedback quality) and item 5 (cost), plus whether the sample is big enough to count. */
export function judgeG0(stats: Stats, t: Thresholds): G0Verdicts {
  const item4: Check[] = [];
  const { wer, corrections } = stats;

  if (wer.overall === null) {
    item4.push({ status: "pending", text: "No recording has a reference transcript yet, so the word error rate cannot be worked out." });
  } else {
    item4.push({
      status: wer.overall > t.maxWerOverall ? "fail" : "ok",
      text: `Overall word error rate ${pct(wer.overall)} (limit ${pct(t.maxWerOverall, 0)}).`,
    });
    const over = wer.groups.filter((g) => g.wer > t.maxWerGroup);
    item4.push(
      over.length > 0
        ? { status: "fail", text: `Speaker groups above the ${pct(t.maxWerGroup, 0)} limit: ${over.map((g) => `${g.group} ${pct(g.wer)}`).join(", ")}.` }
        : { status: "ok", text: `All ${wer.groups.length} speaker group(s) are at or under ${pct(t.maxWerGroup, 0)}.` },
    );
  }

  if (corrections.shown === 0) {
    item4.push({ status: "pending", text: "There are no corrections to judge yet." });
  } else if (corrections.unmarked > 0) {
    item4.push({
      status: "pending",
      text:
        corrections.unmarked === corrections.shown
          ? `None of the ${corrections.shown} corrections is marked right or wrong yet.`
          : `${corrections.unmarked} of ${corrections.shown} corrections are not marked right or wrong yet.`,
    });
  } else {
    const rate = corrections.right / corrections.shown;
    item4.push({
      status: rate < t.minCorrectionsRight ? "fail" : "ok",
      text: `${corrections.right} of ${corrections.shown} corrections judged right (${pct(rate)}; at least ${pct(t.minCorrectionsRight, 0)} needed).`,
    });
  }

  const item5: Check[] = [];
  const perMinute = stats.cost.perMinutePkr;
  if (perMinute === null) {
    item5.push({ status: "pending", text: "No audio was processed, so the cost per minute cannot be worked out." });
  } else {
    item5.push({
      status: perMinute > t.maxCostPkrPerMinute ? "fail" : "ok",
      text: `PKR ${perMinute.toFixed(2)} per minute of recorded audio (limit PKR ${t.maxCostPkrPerMinute.toFixed(2)}; planning number PKR ${t.planningCostPkrPerMinute.toFixed(2)}).`,
    });
  }

  const notes: string[] = [];
  if (stats.recordingsProcessed < t.minRecordings) notes.push(`${stats.recordingsProcessed} recordings processed, ${t.minRecordings} needed`);
  if (stats.speakers < t.minSpeakers) notes.push(`${stats.speakers} speakers, ${t.minSpeakers} needed`);
  return { item4: { verdict: toVerdict(item4), checks: item4 }, item5: { verdict: toVerdict(item5), checks: item5 }, sample: { ok: notes.length === 0, notes } };
}

export interface SummaryMeta {
  combo: string;
  stt: { provider: string; model: string | null };
  llm: { provider: string; model: string | null };
  promptVersion: string;
  script: string;
  fxPkrPerUsd: number;
  generatedAt: string;
  /** Files refused for consent or format reasons. They were never sent. */
  refused: Refusal[];
  warnings: string[];
  invalidMarks: string[];
  clearedMarks: number;
  /** How many recordings this run sent to providers, and how many were answered from saved results. */
  callsMade: number;
  reused: number;
  /** The unit prices (USD) the costs were worked out with. null for a provider that does not publish one, such as the mock. */
  prices: { sttUsdPerMinute: number | null; llmUsdPerMillionInput: number | null; llmUsdPerMillionOutput: number | null };
}

export interface SummaryJson {
  meta: SummaryMeta;
  thresholds: Thresholds;
  stats: Stats;
  verdicts: G0Verdicts;
}

const num = (value: number | null, places = 2): string => (value === null ? "n/a" : value.toFixed(places));
const sec = (value: number | null): string => (value === null ? "n/a" : `${value.toFixed(1)} s`);
const label = (p: { provider: string; model: string | null }): string => (p.model ? `${p.provider} (${p.model})` : p.provider);

/** The summary.md text. It never contains a transcript, a correction or a reference text. It ends with the G0 verdicts. */
export function renderSummary({ meta, thresholds: t, stats, verdicts }: SummaryJson): string {
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);
  const mark = (c: Check) => (c.status === "ok" ? "OK" : c.status === "fail" ? "FAIL" : "PENDING");

  push(`# Voice test: ${label(meta.stt)} + ${label(meta.llm)}`, "");
  push(`Run ${meta.generatedAt} · feedback prompt ${meta.promptVersion} · Urdu written in ${meta.script === "urdu" ? "Urdu script" : "Roman Urdu"} · ${meta.fxPkrPerUsd} PKR per USD`);
  push(`This run sent ${meta.callsMade} recording(s) to the providers and reused ${meta.reused} saved result(s) at no cost.`, "");

  push("## Sample", "");
  push(`- Recordings processed: ${stats.recordingsProcessed} (${t.minRecordings} needed)`);
  push(`- Speakers with a reference transcript: ${stats.speakers} (${t.minSpeakers} needed)`);
  push(`- Refused and never sent: ${meta.refused.length}${meta.refused.length ? ` (${meta.refused.map((r) => `${r.file}: ${r.reason}`).join("; ")})` : ""}`);
  push(`- Failed: ${stats.failed.length}`);
  push(`- Left out of the word error rate (no reference): ${stats.wer.filesWithoutReference}`, "");

  push("## Word error rate", "");
  if (stats.wer.overall === null) push("No recording has a reference transcript.", "");
  else {
    push(`Overall **${pct(stats.wer.overall)}** (${stats.wer.errors} errors in ${stats.wer.refWords} reference words). Limit ${pct(t.maxWerOverall, 0)}.`, "");
    push("| Speaker group | Recordings | Reference words | Errors | WER |", "|---|---|---|---|---|");
    for (const g of stats.wer.groups) push(`| ${g.group}${g.files < 3 ? " (few recordings)" : ""} | ${g.files} | ${g.refWords} | ${g.errors} | ${pct(g.wer)} |`);
    push("", `Highest: ${stats.wer.worst.map((w) => `${w.file} ${pct(w.wer, 0)}`).join(", ")}`, "");
  }

  push("## Correction quality", "");
  const c = stats.corrections;
  if (c.shown === 0) push("No corrections yet.", "");
  else {
    const marked = c.right + c.wrong;
    push(`${c.shown} corrections shown. Marked so far: ${marked} (${c.right} right, ${c.wrong} wrong); not marked: ${c.unmarked}.`);
    if (marked > 0) push(`Right so far: ${pct(c.right / marked)} of those marked. Needed: ${pct(t.minCorrectionsRight, 0)} of all shown.`);
    for (const k of c.byKind) push(`- ${k.kind}: ${k.shown} shown, ${k.right} right, ${k.wrong} wrong`);
    push("");
  }
  if (meta.invalidMarks.length > 0) push(`These marks were not "right" or "wrong" and were not counted: ${meta.invalidMarks.join("; ")}`, "");
  if (meta.clearedMarks > 0) push(`${meta.clearedMarks} earlier mark(s) were cleared because the correction text changed in this run. Mark them again.`, "");

  push("## Cost per minute of recorded audio", "");
  push("| | USD | PKR |", "|---|---|---|");
  push(`| Speech-to-text | ${num(stats.cost.sttPerMinutePkr === null ? null : stats.cost.sttPerMinutePkr / meta.fxPkrPerUsd, 5)} | ${num(stats.cost.sttPerMinutePkr)} |`);
  push(`| Feedback model | ${num(stats.cost.llmPerMinutePkr === null ? null : stats.cost.llmPerMinutePkr / meta.fxPkrPerUsd, 5)} | ${num(stats.cost.llmPerMinutePkr)} |`);
  push(`| **Total** | ${num(stats.cost.perMinuteUsd, 5)} | **${num(stats.cost.perMinutePkr)}** |`, "");
  push(`Planning number PKR ${t.planningCostPkrPerMinute.toFixed(2)}; G0 limit PKR ${t.maxCostPkrPerMinute.toFixed(2)}. ${stats.cost.audioMinutes.toFixed(1)} minutes of audio; this set cost USD ${stats.cost.totalUsd.toFixed(4)} in total.`);
  push(`Average feedback call: ${num(stats.cost.avgInputTokens, 0)} tokens in, ${num(stats.cost.avgOutputTokens, 0)} tokens out.`, "");
  push("The cost is counted per minute of the learner's recorded audio. A lesson's active time also includes tutor audio, which is made once and cached (PRD 5.2), so the real cost per active minute is lower than this.", "");
  const { prices } = meta;
  const priceText = [
    prices.sttUsdPerMinute === null ? null : `speech-to-text USD ${prices.sttUsdPerMinute} per audio minute`,
    prices.llmUsdPerMillionInput === null || prices.llmUsdPerMillionOutput === null ? null : `feedback USD ${prices.llmUsdPerMillionInput} in / ${prices.llmUsdPerMillionOutput} out per million tokens`,
  ].filter(Boolean);
  push(`Unit prices used: ${priceText.length > 0 ? priceText.join("; ") : "none (mock providers)"}.`, "");
  push("**Check the money:** these unit prices are tagged [VERIFY] in the adapter files. Compare the total above with what the provider dashboards show for this run. If they differ, set the price variable named in `.env.example` and run the same command again: saved results are re-priced, nothing is sent, and your marks are kept.", "");

  push("## Speed (measured from this computer)", "");
  push("| | Median | 90th percentile | Slowest |", "|---|---|---|---|");
  for (const [name, p] of [["Speech-to-text", stats.latencySeconds.stt], ["Feedback", stats.latencySeconds.feedback], ["Both", stats.latencySeconds.total]] as const) {
    push(`| ${name} | ${sec(p.median)} | ${sec(p.p90)} | ${sec(p.max)} |`);
  }
  push("", "PRD 14 asks for feedback within 8 s on 4G and 15 s on 3G at the median.", "");

  push("## Feedback reliability", "");
  push(`${stats.feedback.valid} of ${stats.feedback.attempted} replies were usable (exactly 3 corrections, scores in range); ${stats.feedback.recovered} needed the JSON cut out of extra text.`, "");

  push("## Failed files", "");
  if (stats.failed.length === 0) push("None.", "");
  else push(...stats.failed.map((f) => `- ${f.file} (${f.status}): ${f.error}`), "");

  if (meta.warnings.length > 0) push("## Warnings", "", ...meta.warnings.map((w) => `- ${w}`), "");

  push("## G0 items 4 and 5", "");
  push(`**Item 4, feedback quality: ${verdicts.item4.verdict}**`, "");
  push(...verdicts.item4.checks.map((k) => `- ${mark(k)}: ${k.text}`), "");
  push(`**Item 5, cost: ${verdicts.item5.verdict}**`, "");
  push(...verdicts.item5.checks.map((k) => `- ${mark(k)}: ${k.text}`), "");
  push(verdicts.sample.ok ? "Sample size: OK." : `**Sample too small, so this does not count for G0 yet:** ${verdicts.sample.notes.join("; ")}.`, "");
  return out.join("\n");
}

/** A side-by-side table of every combination that has been run. */
export function renderComparison(summaries: readonly SummaryJson[]): string {
  const rows = summaries.map(({ meta, stats, verdicts }) => {
    const c = stats.corrections;
    const marked = c.right + c.wrong;
    return [
      `${label(meta.stt)} + ${label(meta.llm)}`,
      String(stats.recordingsProcessed),
      stats.wer.overall === null ? "n/a" : pct(stats.wer.overall),
      stats.wer.groups[0] ? `${stats.wer.groups[0].group} ${pct(stats.wer.groups[0].wer)}` : "n/a",
      c.shown === 0 ? "n/a" : c.unmarked > 0 ? `${marked} of ${c.shown} marked` : pct(c.right / c.shown),
      num(stats.cost.perMinutePkr),
      sec(stats.latencySeconds.stt.median),
      sec(stats.latencySeconds.feedback.median),
      verdicts.item4.verdict,
      verdicts.item5.verdict,
    ];
  });
  return [
    "# Voice test: combinations compared",
    "",
    "| Combination | Recordings | WER | Worst group | Corrections right | PKR per minute | STT median | Feedback median | Item 4 | Item 5 |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.join(" | ")} |`),
    "",
  ].join("\n");
}
