import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { classifyFile } from "./audio";
import { readTable } from "./csv";

export const CONSENT_FILE = "consent.csv";
export const REFERENCE_FILE = "reference.csv";

/** A problem with the files the founder supplied. The message says what to fix. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export interface Reference {
  speaker: string;
  group: string;
  text: string;
  /** What the speaker was asked (the "prompt" column of reference.csv). Empty when it does not say. */
  question: string;
}

export interface InputItem {
  file: string;
  path: string;
  mimeType: string;
  consentVersion: string;
  consentDate: string;
  /** null when reference.csv has no usable row for this file: it is then left out of the word error rate. */
  reference: Reference | null;
}

export interface Refusal {
  file: string;
  reason: string;
}

export interface LoadedInputs {
  /** Recordings that may be sent to a provider: each has a stored consent version. */
  items: InputItem[];
  /** Recordings that must NOT be sent, with the reason. */
  refused: Refusal[];
  warnings: string[];
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function uniqueByFile(rows: Record<string, string>[], fileName: string): Map<string, Record<string, string>> {
  const byFile = new Map<string, Record<string, string>>();
  const repeated = new Set<string>();
  for (const row of rows) {
    const file = row.file ?? "";
    if (!file) continue;
    if (byFile.has(file)) repeated.add(file);
    byFile.set(file, row);
  }
  if (repeated.size > 0) {
    throw new InputError(`${fileName} lists these files more than once, so it is unclear which row to use: ${[...repeated].join(", ")}.`);
  }
  return byFile;
}

/**
 * Reads the recordings folder, consent.csv and reference.csv.
 * A recording with no consent row, or an empty consent version, is refused here and never reaches a provider.
 */
export async function loadInputs(dir: string): Promise<LoadedInputs> {
  let entries: string[];
  try {
    entries = (await readdir(dir)).sort();
  } catch {
    throw new InputError(`Cannot open the recordings folder "${dir}". Create it and put the audio files and the two CSV files in it.`);
  }

  const consentText = await readIfExists(join(dir, CONSENT_FILE));
  if (consentText === null) {
    throw new InputError(`${CONSENT_FILE} is missing from "${dir}". It needs the columns: file, consent_version, date. No recording is sent without it.`);
  }
  const referenceText = await readIfExists(join(dir, REFERENCE_FILE));
  if (referenceText === null) {
    throw new InputError(`${REFERENCE_FILE} is missing from "${dir}". It needs the columns: file, speaker, speaker_group, reference_transcript (and optionally prompt).`);
  }

  const consent = readTable(consentText, {
    required: { file: ["filename", "file_name", "recording"], consent_version: ["version", "consent"] },
    optional: { date: ["consent_date"] },
  });
  if (consent.missing.length > 0) throw new InputError(`${CONSENT_FILE} has no "${consent.missing.join('" or "')}" column. The columns are: file, consent_version, date.`);

  const reference = readTable(referenceText, {
    required: {
      file: ["filename", "file_name", "recording"],
      speaker: ["speaker_id", "speaker_name"],
      speaker_group: ["group", "group_name"],
      reference_transcript: ["reference", "transcript", "text"],
    },
    optional: { prompt: ["question", "task"] },
  });
  if (reference.missing.length > 0) {
    throw new InputError(`${REFERENCE_FILE} has no "${reference.missing.join('" or "')}" column. The columns are: file, speaker, speaker_group, reference_transcript.`);
  }

  const consentByFile = uniqueByFile(consent.rows, CONSENT_FILE);
  const referenceByFile = uniqueByFile(reference.rows, REFERENCE_FILE);

  const items: InputItem[] = [];
  const refused: Refusal[] = [];
  const warnings: string[] = [];
  const audioFiles = new Set<string>();

  for (const file of entries) {
    const kind = classifyFile(file);
    if (kind.kind === "not-audio") continue;
    audioFiles.add(file);
    if (kind.kind === "unsupported") {
      refused.push({ file, reason: "audio format not supported by the providers; convert it to wav, mp3, m4a, ogg or webm" });
      continue;
    }
    const consentRow = consentByFile.get(file);
    if (!consentRow) {
      refused.push({ file, reason: `no row in ${CONSENT_FILE}, so no consent version is stored` });
      continue;
    }
    const consentVersion = consentRow.consent_version ?? "";
    if (consentVersion === "") {
      refused.push({ file, reason: `the consent version is empty in ${CONSENT_FILE}` });
      continue;
    }
    const consentDate = consentRow.date ?? "";
    if (consentDate === "" || Number.isNaN(Date.parse(consentDate))) {
      warnings.push(`${file}: the consent date in ${CONSENT_FILE} is missing or not a date (the version is stored, so it is still used)`);
    }

    const referenceRow = referenceByFile.get(file);
    let ref: Reference | null = null;
    if (!referenceRow) {
      warnings.push(`${file}: no row in ${REFERENCE_FILE}, so it is left out of the word error rate`);
    } else if ((referenceRow.reference_transcript ?? "") === "") {
      warnings.push(`${file}: the reference transcript is empty, so it is left out of the word error rate`);
    } else {
      ref = {
        speaker: referenceRow.speaker ?? "",
        group: referenceRow.speaker_group ?? "",
        text: referenceRow.reference_transcript ?? "",
        question: referenceRow.prompt ?? "",
      };
      if (ref.speaker === "" || ref.group === "") {
        warnings.push(`${file}: the speaker or speaker_group is empty in ${REFERENCE_FILE}, so it cannot be counted in a group`);
      }
    }
    items.push({ file, path: join(dir, file), mimeType: kind.mimeType, consentVersion, consentDate, reference: ref });
  }

  for (const file of consentByFile.keys()) {
    if (!audioFiles.has(file)) warnings.push(`${CONSENT_FILE} lists "${file}" but there is no such audio file`);
  }
  for (const file of referenceByFile.keys()) {
    if (!audioFiles.has(file)) warnings.push(`${REFERENCE_FILE} lists "${file}" but there is no such audio file`);
  }
  return { items, refused, warnings };
}
