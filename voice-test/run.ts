import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConfigError } from "@/lib/config/errors";
import type { LlmProvider } from "@/lib/llm";
import { ProviderError } from "@/lib/providers/errors";
import { audioCostUsd, tokenCostUsd } from "@/lib/providers/pricing";
import type { SttProvider } from "@/lib/stt";
import { audioDurationSeconds } from "./audio";
import { toCsv } from "./csv";
import { buildFeedbackRequest, loadFeedbackPrompt, parseFeedback, type FeedbackPrompt, type ScriptChoice } from "./feedback";
import { loadInputs, type InputItem } from "./inputs";
import { fileCostUsd, resultsCsvRows, type FeedbackOutcome, type FileResult } from "./results";
import { mergeReviewSheet, readMarks, type ReviewRow } from "./review";
import { computeStats, judgeG0, renderComparison, renderSummary, type SummaryJson, type Thresholds } from "./summary";
import { wordErrorsForText } from "./wer";

export interface RunOptions {
  /** Folder with the audio, consent.csv and reference.csv. Git-ignored. */
  recordingsDir: string;
  /** Folder results are written to. Git-ignored. */
  resultsRoot: string;
  /** Repo root, where prompts/ lives. */
  promptRoot: string;
  script: ScriptChoice;
  /** Only the first N recordings, for a cheap first try. */
  limit: number | null;
  /** Check the files and show the audio length without calling any provider. */
  dryRun: boolean;
  /** Ignore saved results and send everything again. */
  fresh: boolean;
}

export interface RunDeps {
  /** Already guarded: it refuses any request without a consent version. */
  stt: SttProvider;
  llm: LlmProvider;
  fxPkrPerUsd: number;
  thresholds: Thresholds;
  /** Where progress lines go. They never contain transcripts, corrections or reference text. */
  write: (line: string) => void;
  now?: () => Date;
  /** Milliseconds, for timing. */
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunOutcome {
  comboDir: string | null;
  /** Why the run stopped before the end, if it did. */
  stoppedEarly: string | null;
  summary: SummaryJson | null;
}

const MAX_ATTEMPTS = 3;
const STOP_AFTER_FAILURES_IN_A_ROW = 3;

class RunStopped extends Error {}

const sha = (...parts: (string | Uint8Array | null | undefined)[]): string => {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part ?? "");
    hash.update("\u0000");
  }
  return hash.digest("hex");
};

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Folder name for one provider combination and one prompt version, for example
 * "stt-deepgram-nova-3__llm-openai-gpt-5.4-mini__prompt-tutor-feedback.v1". A new prompt version gets a new folder,
 * so results made with different prompts never mix.
 */
export function comboName(stt: Pick<SttProvider, "name" | "model">, llm: Pick<LlmProvider, "name" | "model">, promptVersion: string): string {
  return `stt-${slug([stt.name, stt.model].filter(Boolean).join("-"))}__llm-${slug([llm.name, llm.model].filter(Boolean).join("-"))}__prompt-${slug(promptVersion)}`;
}

/** A message that is safe to print and save. Unknown errors are not described, in case they carry content. */
function describeError(error: unknown): string {
  if (error instanceof ProviderError || error instanceof ConfigError || error instanceof RangeError) return error.message;
  return `unexpected error (${error instanceof Error ? error.name : "unknown"})`;
}

function stopIfKeyRefused(error: unknown): void {
  if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) {
    throw new RunStopped(`${error.message}. The provider refused the key, so the run stopped before anything else was sent. Check the key in .env.local.`);
  }
}

const savedPath = (comboDir: string, file: string): string => join(comboDir, "files", `${encodeURIComponent(file)}.json`);

async function readSaved(comboDir: string, file: string): Promise<FileResult | null> {
  try {
    const saved = JSON.parse(await readFile(savedPath(comboDir, file), "utf8")) as FileResult;
    return saved.file === file && saved.keys && typeof saved.keys.stt === "string" ? saved : null;
  } catch {
    return null;
  }
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

interface Context {
  deps: RunDeps;
  prompt: FeedbackPrompt;
  script: ScriptChoice;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
}

/** Runs a provider call, trying again after a network problem or a "busy" reply. Reports how long the good attempt took. */
async function withRetries<T>(ctx: Context, task: () => Promise<T>): Promise<{ value: T; ms: number; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    const started = ctx.clock();
    try {
      const value = await task();
      return { value, ms: ctx.clock() - started, attempts: attempt };
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !(error instanceof ProviderError) || !error.retryable) throw error;
      await ctx.sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

/** One recording: speech-to-text, then feedback, reusing saved results whose inputs have not changed. */
async function processFile(item: InputItem, previous: FileResult | null, ctx: Context): Promise<{ result: FileResult; calledProvider: boolean }> {
  const { deps } = ctx;
  const base: FileResult = {
    file: item.file,
    speaker: item.reference?.speaker ?? null,
    group: item.reference?.group ?? null,
    consentVersion: item.consentVersion,
    audioSeconds: null,
    status: "unreadable",
    error: null,
    stt: null,
    llm: null,
    feedback: null,
    wer: null,
    referenceText: item.reference?.text ?? null,
    promptVersion: ctx.prompt.version,
    keys: { stt: "", feedback: "" },
  };
  let calledProvider = false;

  let audio: Uint8Array;
  let audioSeconds: number;
  try {
    audio = await readFile(item.path);
    audioSeconds = await audioDurationSeconds(audio, item.mimeType);
  } catch {
    return { result: { ...base, error: "could not read the file or its length (is it damaged?)" }, calledProvider };
  }
  base.audioSeconds = audioSeconds;

  // --- speech-to-text ---
  const sttKey = sha(audio, deps.stt.name, deps.stt.model, "en");
  base.keys.stt = sttKey;
  let stt = previous && previous.keys.stt === sttKey ? previous.stt : null;
  // A saved result is re-priced at the price in use now, so correcting a price needs no new provider call.
  if (stt && deps.stt.pricing) stt = { ...stt, costUsd: audioCostUsd(audioSeconds, deps.stt.pricing.usdPerAudioMinute) };
  if (!stt) {
    try {
      const attempt = await withRetries(ctx, () =>
        deps.stt.transcribe({ audio, mimeType: item.mimeType, language: "en", consentVersion: item.consentVersion, audioSeconds }),
      );
      calledProvider = true;
      stt = {
        provider: attempt.value.provider,
        model: deps.stt.model ?? null,
        ms: attempt.ms,
        attempts: attempt.attempts,
        costUsd: attempt.value.costUsd,
        transcript: attempt.value.transcript,
      };
    } catch (error) {
      stopIfKeyRefused(error);
      return { result: { ...base, status: "stt_failed", error: describeError(error) }, calledProvider };
    }
  }
  base.stt = stt;
  if (item.reference) {
    try {
      base.wer = wordErrorsForText(item.reference.text, stt.transcript);
    } catch {
      base.wer = null; // a reference with no words in it
    }
  }

  // --- feedback ---
  const question = item.reference?.question ?? "";
  const feedbackKey = sha(sttKey, stt.transcript, deps.llm.name, deps.llm.model, ctx.prompt.hash, ctx.script, question);
  base.keys.feedback = feedbackKey;
  if (previous && previous.keys.feedback === feedbackKey && previous.feedback?.valid && previous.llm) {
    const price = deps.llm.pricing;
    const llm = price ? { ...previous.llm, costUsd: tokenCostUsd(previous.llm.inputTokens, previous.llm.outputTokens, price.usdPerMillionInput, price.usdPerMillionOutput) } : previous.llm;
    return { result: { ...base, status: "ok", llm, feedback: previous.feedback }, calledProvider };
  }

  const failedFeedback = (error: string): FeedbackOutcome => ({ valid: false, recovered: false, error, scoreParts: null, practiceScore: null, corrections: [] });
  if (stt.transcript === "") {
    return { result: { ...base, status: "feedback_failed", feedback: failedFeedback("empty transcript, feedback skipped") }, calledProvider };
  }
  const request = buildFeedbackRequest(ctx.prompt, { script: ctx.script, question, transcript: stt.transcript, audioSeconds });
  try {
    const attempt = await withRetries(ctx, () => deps.llm.complete(request));
    calledProvider = true;
    const llm = {
      provider: attempt.value.provider,
      model: deps.llm.model ?? null,
      ms: attempt.ms,
      attempts: attempt.attempts,
      inputTokens: attempt.value.inputTokens,
      outputTokens: attempt.value.outputTokens,
      costUsd: attempt.value.costUsd,
    };
    const parsed = parseFeedback(attempt.value.text);
    const feedback: FeedbackOutcome = parsed.ok
      ? { valid: true, recovered: parsed.recovered, error: null, scoreParts: parsed.feedback.scoreParts, practiceScore: parsed.feedback.practiceScore, corrections: parsed.feedback.corrections }
      : failedFeedback(parsed.reason);
    return { result: { ...base, status: feedback.valid ? "ok" : "feedback_failed", error: feedback.error, llm, feedback }, calledProvider };
  } catch (error) {
    stopIfKeyRefused(error);
    const reason = describeError(error);
    return { result: { ...base, status: "feedback_failed", error: reason, feedback: failedFeedback(reason) }, calledProvider };
  }
}

async function writeOutputs(comboDir: string, resultsRoot: string, summary: SummaryJson, results: readonly FileResult[], fx: number, sheet: string): Promise<void> {
  await writeFile(join(comboDir, "results.csv"), toCsv(resultsCsvRows(results, fx)));
  await writeFile(join(comboDir, "corrections_review.csv"), sheet);
  await writeFile(join(comboDir, "summary.md"), renderSummary(summary));
  await writeFile(join(comboDir, "summary.json"), JSON.stringify(summary, null, 2));

  const summaries: SummaryJson[] = [];
  for (const entry of (await readdir(resultsRoot, { withFileTypes: true })).filter((e) => e.isDirectory())) {
    const text = await readIfExists(join(resultsRoot, entry.name, "summary.json"));
    if (text) summaries.push(JSON.parse(text) as SummaryJson);
  }
  await writeFile(join(resultsRoot, "comparison.md"), renderComparison(summaries.sort((a, b) => a.meta.combo.localeCompare(b.meta.combo))));
}

/** The whole voice test for one provider combination. */
export async function runVoiceTest(options: RunOptions, deps: RunDeps): Promise<RunOutcome> {
  const { write } = deps;
  const ctxBase = { clock: deps.clock ?? (() => performance.now()), sleep: deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))) };

  const inputs = await loadInputs(options.recordingsDir);
  write(`Found ${inputs.items.length} recording(s) with a stored consent version; ${inputs.refused.length} refused.`);
  for (const refusal of inputs.refused) write(`REFUSED ${refusal.file}: ${refusal.reason}`);
  for (const warning of inputs.warnings) write(`WARNING ${warning}`);
  const items = options.limit === null ? inputs.items : inputs.items.slice(0, options.limit);
  if (items.length === 0) {
    write("Nothing to run.");
    return { comboDir: null, stoppedEarly: null, summary: null };
  }

  if (options.dryRun) {
    let seconds = 0;
    for (const item of items) {
      try {
        const length = await audioDurationSeconds(await readFile(item.path), item.mimeType);
        seconds += length;
        write(`  ${item.file}  ${length.toFixed(1)} s${item.reference ? "" : "  (no reference)"}`);
      } catch {
        write(`  ${item.file}  could not read its length (is it damaged?)`);
      }
    }
    const minutes = seconds / 60;
    const ceilingPkr = minutes * deps.thresholds.maxCostPkrPerMinute;
    write(`Dry run: ${items.length} recording(s), ${minutes.toFixed(1)} minutes of audio. Nothing was sent.`);
    write(`At the G0 limit of PKR ${deps.thresholds.maxCostPkrPerMinute} per minute, a full run would cost at most about PKR ${ceilingPkr.toFixed(0)}.`);
    return { comboDir: null, stoppedEarly: null, summary: null };
  }

  const prompt = await loadFeedbackPrompt(options.promptRoot);
  const ctx: Context = { deps, prompt, script: options.script, ...ctxBase };
  const combo = comboName(deps.stt, deps.llm, prompt.version);
  const comboDir = join(options.resultsRoot, combo);
  await mkdir(join(comboDir, "files"), { recursive: true });

  const results: FileResult[] = [];
  let callsMade = 0;
  let reused = 0;
  let failuresInARow = 0;
  let stoppedEarly: string | null = null;

  for (const [index, item] of items.entries()) {
    const previous = options.fresh ? null : await readSaved(comboDir, item.file);
    const position = `[${String(index + 1).padStart(String(items.length).length)}/${items.length}] ${item.file}`;
    try {
      const { result, calledProvider } = await processFile(item, previous, ctx);
      results.push(result);
      await writeFile(savedPath(comboDir, item.file), JSON.stringify(result, null, 2));
      if (calledProvider) callsMade += 1;
      else reused += 1;

      if (result.status === "ok") {
        write(`${position}  ${result.audioSeconds?.toFixed(1)} s  speech ${((result.stt?.ms ?? 0) / 1000).toFixed(1)} s  feedback ${((result.llm?.ms ?? 0) / 1000).toFixed(1)} s  PKR ${(fileCostUsd(result) * deps.fxPkrPerUsd).toFixed(2)}${calledProvider ? "" : "  (saved result reused)"}`);
      } else {
        write(`${position}  FAILED (${result.status}): ${result.error ?? "unknown reason"}`);
      }
      failuresInARow = result.status === "stt_failed" || result.status === "feedback_failed" ? failuresInARow + 1 : 0;
      // Only an early stop if something was left to skip. Failing on the last recording is just a failure.
      if (failuresInARow >= STOP_AFTER_FAILURES_IN_A_ROW && index < items.length - 1) {
        stoppedEarly = `${STOP_AFTER_FAILURES_IN_A_ROW} recordings in a row failed, so the run stopped before spending more. Fix the cause shown above and run the same command again: finished recordings are kept.`;
        break;
      }
    } catch (error) {
      if (error instanceof RunStopped) {
        stoppedEarly = error.message;
        break;
      }
      throw error;
    }
  }
  if (stoppedEarly) write(`STOPPED: ${stoppedEarly}`);

  // --- review sheet, marks, summary ---
  const reviewRows: ReviewRow[] = results.flatMap((r) =>
    r.feedback?.valid ? r.feedback.corrections.map((c, i) => ({ file: r.file, correction: i + 1, kind: c.kind, said: c.said, better: c.better, why: c.why })) : [],
  );
  const sheet = mergeReviewSheet(await readIfExists(join(comboDir, "corrections_review.csv")), reviewRows);
  const { marks, invalid } = readMarks(sheet.csv);
  const stats = computeStats(results, marks, deps.fxPkrPerUsd);
  const summary: SummaryJson = {
    meta: {
      combo,
      stt: { provider: deps.stt.name, model: deps.stt.model ?? null },
      llm: { provider: deps.llm.name, model: deps.llm.model ?? null },
      promptVersion: prompt.version,
      script: options.script,
      fxPkrPerUsd: deps.fxPkrPerUsd,
      generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
      refused: inputs.refused,
      warnings: [...inputs.warnings, ...(stoppedEarly ? [`The run stopped early: ${stoppedEarly}`] : [])],
      invalidMarks: invalid,
      clearedMarks: sheet.cleared,
      callsMade,
      reused,
      prices: { sttUsdPerMinute: deps.stt.pricing?.usdPerAudioMinute ?? null, llmUsdPerMillionInput: deps.llm.pricing?.usdPerMillionInput ?? null, llmUsdPerMillionOutput: deps.llm.pricing?.usdPerMillionOutput ?? null },
    },
    thresholds: deps.thresholds,
    stats,
    verdicts: judgeG0(stats, deps.thresholds),
  };
  await writeOutputs(comboDir, options.resultsRoot, summary, results, deps.fxPkrPerUsd, sheet.csv);

  write(`Done: ${callsMade} sent to providers, ${reused} reused. Results are in ${comboDir}`);
  write(`G0 item 4 (feedback quality): ${summary.verdicts.item4.verdict}. G0 item 5 (cost): ${summary.verdicts.item5.verdict}.`);
  if (stats.corrections.unmarked > 0) {
    write(`Next: open ${join(comboDir, "corrections_review.csv")}, write right or wrong in the verdict column for every row, then run the same command again.`);
  }
  return { comboDir, stoppedEarly, summary };
}
