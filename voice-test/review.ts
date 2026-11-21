import { readTable, toCsv } from "./csv";

export type Verdict = "right" | "wrong";

// "sahi" and "ghalat" are accepted because that is what the app calls them (the "ghalat correction" button).
const RIGHT = new Set(["right", "sahi", "sahih", "correct", "yes", "y", "ok", "true", "1"]);
const WRONG = new Set(["wrong", "ghalat", "galat", "incorrect", "no", "n", "false", "0"]);

/** "unmarked" for an empty cell, "invalid" for something that is neither right nor wrong. */
export function parseVerdict(raw: string): Verdict | "unmarked" | "invalid" {
  const value = raw.trim().toLowerCase();
  if (value === "") return "unmarked";
  if (RIGHT.has(value)) return "right";
  if (WRONG.has(value)) return "wrong";
  return "invalid";
}

export const markKey = (file: string, correction: number): string => `${file}#${correction}`;

export interface ReviewRow {
  file: string;
  /** 1, 2 or 3. */
  correction: number;
  kind: string;
  said: string;
  better: string;
  why: string;
}

const HEADER = ["file", "correction", "verdict", "kind", "said", "better", "why"];

export interface MergedSheet {
  csv: string;
  /** Marks removed because the correction text changed since it was marked. */
  cleared: number;
}

/**
 * Builds the review sheet the founder marks. Existing marks are kept. Rows are added for new corrections.
 * If a correction's text changed (a re-run), its old mark is cleared, because it judged different words.
 * Rows for files not in this run are kept as they are, so a limited run never deletes marks.
 */
export function mergeReviewSheet(existingCsv: string | null, rows: readonly ReviewRow[]): MergedSheet {
  const merged = new Map<string, { row: ReviewRow; verdict: string }>();

  if (existingCsv !== null) {
    const table = readTable(existingCsv, {
      required: { file: [], correction: ["number", "no"] },
      optional: { verdict: ["mark", "right_or_wrong"], kind: [], said: [], better: [], why: [] },
    });
    if (table.missing.length > 0) throw new Error(`the review sheet has no "${table.missing.join('" or "')}" column`);
    for (const row of table.rows) {
      const correction = Number(row.correction);
      if (!row.file || !Number.isInteger(correction)) continue;
      merged.set(markKey(row.file, correction), {
        row: { file: row.file, correction, kind: row.kind ?? "", said: row.said ?? "", better: row.better ?? "", why: row.why ?? "" },
        verdict: row.verdict ?? "",
      });
    }
  }

  let cleared = 0;
  for (const row of rows) {
    const key = markKey(row.file, row.correction);
    const old = merged.get(key);
    const same = old !== undefined && old.row.said === row.said && old.row.better === row.better;
    if (old && !same && old.verdict.trim() !== "") cleared++;
    merged.set(key, { row, verdict: same ? old.verdict : "" });
  }

  const sorted = [...merged.values()].sort((a, b) => a.row.file.localeCompare(b.row.file) || a.row.correction - b.row.correction);
  const csv = toCsv([HEADER, ...sorted.map(({ row, verdict }) => [row.file, row.correction, verdict, row.kind, row.said, row.better, row.why])]);
  return { csv, cleared };
}

export interface Marks {
  marks: Map<string, Verdict>;
  /** Cells that were neither right nor wrong, for example "maybe". They are not counted. */
  invalid: string[];
}

/** Reads the founder's marks from the review sheet. */
export function readMarks(csv: string): Marks {
  const table = readTable(csv, {
    required: { file: [], correction: ["number", "no"] },
    optional: { verdict: ["mark", "right_or_wrong"] },
  });
  const marks = new Map<string, Verdict>();
  const invalid: string[] = [];
  for (const row of table.rows) {
    const correction = Number(row.correction);
    if (!row.file || !Number.isInteger(correction)) continue;
    const verdict = parseVerdict(row.verdict ?? "");
    if (verdict === "right" || verdict === "wrong") marks.set(markKey(row.file, correction), verdict);
    else if (verdict === "invalid") invalid.push(`${row.file} correction ${correction}: "${row.verdict}"`);
  }
  return { marks, invalid };
}
