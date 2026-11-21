/**
 * Reads CSV text into rows of cells. Handles quoted cells, doubled quotes, commas and line breaks inside quotes,
 * Windows line endings and a byte-order mark (Excel adds one). Blank lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char !== '"') cell += char;
      else if (input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "Speaker group" -> "speaker_group", so headers can be typed the way people type them. */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface ColumnSpec {
  /** Columns that must be present. Each maps to the header spellings accepted for it (already normalised). */
  required: Record<string, readonly string[]>;
  /** Columns that may be present. Missing ones come back as "". */
  optional?: Record<string, readonly string[]>;
}

export interface Table {
  rows: Record<string, string>[];
  /** Required columns that were not found, by their canonical name. */
  missing: string[];
}

/** Turns CSV text into rows keyed by column name, trimming every cell. */
export function readTable(text: string, spec: ColumnSpec): Table {
  const [headerRow = [], ...body] = parseCsv(text);
  const headers = headerRow.map(normalizeHeader);
  const all = { ...spec.optional, ...spec.required };
  const index: Record<string, number> = {};
  const missing: string[] = [];

  for (const [name, aliases] of Object.entries(all)) {
    const found = headers.findIndex((h) => h === name || aliases.includes(h));
    if (found >= 0) index[name] = found;
    else if (name in spec.required) missing.push(name);
  }
  const rows = body.map((cells) => {
    const row: Record<string, string> = {};
    for (const name of Object.keys(all)) row[name] = (cells[index[name] ?? -1] ?? "").trim();
    return row;
  });
  return { rows, missing };
}

type Cell = string | number | boolean | null | undefined;

/** Writes rows as CSV text, quoting any cell that needs it. */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  const escape = (value: Cell): string => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(escape).join(",")).join("\n") + "\n";
}
