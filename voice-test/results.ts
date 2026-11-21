import { usdToPkr } from "@/lib/cost";
import type { Correction, ScoreParts } from "./feedback";
import { totalErrors, type WordErrors } from "./wer";

export interface SttOutcome {
  provider: string;
  model: string | null;
  /** Milliseconds the successful attempt took, measured from this computer. */
  ms: number;
  attempts: number;
  costUsd: number;
  transcript: string;
}

export interface LlmOutcome {
  provider: string;
  model: string | null;
  ms: number;
  attempts: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface FeedbackOutcome {
  valid: boolean;
  /** The reply was not clean JSON and had to be cut out of fences or extra text. */
  recovered: boolean;
  error: string | null;
  scoreParts: ScoreParts | null;
  practiceScore: number | null;
  corrections: Correction[];
}

export type FileStatus = "ok" | "stt_failed" | "feedback_failed" | "unreadable";

export interface FileResult {
  file: string;
  speaker: string | null;
  group: string | null;
  consentVersion: string;
  audioSeconds: number | null;
  status: FileStatus;
  /** Why the file failed. Safe to print: never audio or transcripts. */
  error: string | null;
  stt: SttOutcome | null;
  llm: LlmOutcome | null;
  feedback: FeedbackOutcome | null;
  wer: WordErrors | null;
  referenceText: string | null;
  promptVersion: string;
  /** What the saved result was made with. A changed key means the saved result is stale and is redone. */
  keys: { stt: string; feedback: string };
}

export const fileCostUsd = (r: FileResult): number => (r.stt?.costUsd ?? 0) + (r.llm?.costUsd ?? 0);

const round = (value: number, places: number): number => Math.round(value * 10 ** places) / 10 ** places;

/** One row per recording for results.csv. Transcripts are included: this file stays on this computer (git-ignored). */
export function resultsCsvRows(results: readonly FileResult[], fxPkrPerUsd: number): (string | number | boolean | null)[][] {
  const header = [
    "file", "speaker", "speaker_group", "status", "error", "audio_seconds",
    "stt_provider", "stt_model", "stt_ms", "stt_attempts", "stt_cost_usd", "transcript", "reference", "wer_errors", "reference_words", "wer",
    "llm_provider", "llm_model", "llm_ms", "llm_attempts", "llm_input_tokens", "llm_output_tokens", "llm_cost_usd",
    "feedback_valid", "feedback_error", "task_fit", "grammar", "vocabulary", "fluency", "practice_score",
    "correction_1", "correction_2", "correction_3", "total_cost_usd", "total_cost_pkr", "fx_pkr_per_usd", "prompt_version",
  ];
  const rows = results.map((r) => {
    const errors = r.wer ? totalErrors(r.wer) : null;
    const costUsd = fileCostUsd(r);
    const correction = (i: number) => {
      const c = r.feedback?.corrections[i];
      return c ? `${c.kind}: "${c.said}" -> "${c.better}" (${c.why})` : null;
    };
    return [
      r.file, r.speaker, r.group, r.status, r.error, r.audioSeconds === null ? null : round(r.audioSeconds, 2),
      r.stt?.provider ?? null, r.stt?.model ?? null, r.stt ? Math.round(r.stt.ms) : null, r.stt?.attempts ?? null, r.stt?.costUsd ?? null,
      r.stt?.transcript ?? null, r.referenceText, errors, r.wer?.refWords ?? null, r.wer && errors !== null ? round(errors / r.wer.refWords, 4) : null,
      r.llm?.provider ?? null, r.llm?.model ?? null, r.llm ? Math.round(r.llm.ms) : null, r.llm?.attempts ?? null,
      r.llm?.inputTokens ?? null, r.llm?.outputTokens ?? null, r.llm?.costUsd ?? null,
      r.feedback ? r.feedback.valid : null, r.feedback?.error ?? null,
      r.feedback?.scoreParts?.taskFit ?? null, r.feedback?.scoreParts?.grammar ?? null, r.feedback?.scoreParts?.vocabulary ?? null,
      r.feedback?.scoreParts?.fluency ?? null, r.feedback?.practiceScore ?? null,
      correction(0), correction(1), correction(2),
      r.stt || r.llm ? costUsd : null, r.stt || r.llm ? usdToPkr(costUsd, fxPkrPerUsd).costPkr : null, r.stt || r.llm ? fxPkrPerUsd : null, r.promptVersion,
    ];
  });
  return [header, ...rows];
}
