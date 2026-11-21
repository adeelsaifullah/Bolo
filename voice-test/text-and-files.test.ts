import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { audioDurationSeconds, classifyFile } from "./audio";
import { normalizeHeader, parseCsv, readTable, toCsv } from "./csv";
import { InputError, loadInputs } from "./inputs";
import { makeRecordingsDir, makeWav, removeTempDirs, tempDir } from "./test-helpers";
import { countWordErrors, normalizeWords, numberToWords, totalErrors, wordErrorsForText } from "./wer";

afterEach(removeTempDirs);

describe("CSV reading and writing", () => {
  it("reads quotes, commas and line breaks inside quotes, Windows line endings and a byte-order mark", () => {
    const text = '﻿file,note\r\na.wav,"hello, ""world"""\r\nb.wav,"two\nlines"\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["file", "note"],
      ["a.wav", 'hello, "world"'],
      ["b.wav", "two\nlines"],
    ]);
  });

  it("reads a last line with no line break and keeps empty cells", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });

  it("writes cells that need quotes and reads them back unchanged", () => {
    const rows = [["file", "text"], ["a.wav", 'say "hi", please\nthanks'], ["b.wav", ""]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("accepts headers the way people type them", () => {
    expect(normalizeHeader(" Speaker Group ")).toBe("speaker_group");
    const table = readTable("File,Speaker Group,Reference\na.wav, g1 ,hello\n", {
      required: { file: [], speaker_group: ["group"], reference_transcript: ["reference"] },
      optional: { prompt: ["question"] },
    });
    expect(table.missing).toEqual([]);
    expect(table.rows).toEqual([{ file: "a.wav", speaker_group: "g1", reference_transcript: "hello", prompt: "" }]);
  });

  it("names the required columns that are missing", () => {
    const table = readTable("file,speaker\na.wav,s1\n", { required: { file: [], speaker: [], speaker_group: ["group"] } });
    expect(table.missing).toEqual(["speaker_group"]);
  });
});

describe("word error rate", () => {
  it("spells out numbers up to 999 and leaves longer ones", () => {
    expect([0, 13, 21, 100, 345].map(numberToWords)).toEqual(["zero", "thirteen", "twenty one", "one hundred", "three hundred forty five"]);
    expect(() => numberToWords(1000)).toThrow(RangeError);
    expect(normalizeWords("in 2024 I had 2 jobs")).toEqual(["in", "2024", "i", "had", "two", "jobs"]);
  });

  it("ignores case, punctuation, hyphens and fillers on both sides", () => {
    expect(normalizeWords("Um, Hello... WORLD! I’m twenty-five, uh.")).toEqual(["hello", "world", "i'm", "twenty", "five"]);
  });

  it("counts substitutions, deletions and insertions", () => {
    const count = (ref: string, hyp: string) => countWordErrors(normalizeWords(ref), normalizeWords(hyp));
    expect(count("the cat sat", "the cat sat")).toEqual({ substitutions: 0, deletions: 0, insertions: 0, refWords: 3 });
    expect(count("the cat sat", "the dog sat")).toMatchObject({ substitutions: 1, deletions: 0, insertions: 0 });
    expect(count("the cat sat", "the sat")).toMatchObject({ substitutions: 0, deletions: 1, insertions: 0 });
    expect(count("the cat sat", "the big cat sat")).toMatchObject({ substitutions: 0, deletions: 0, insertions: 1 });
    expect(count("the cat sat", "")).toMatchObject({ deletions: 3 });
    expect(count("the cat sat", "cat sat down")).toMatchObject({ deletions: 1, insertions: 1 });
  });

  it("works out errors from the two texts, and refuses a reference with no words", () => {
    const errors = wordErrorsForText("Hello, my name is Ayesha.", "hello my name is aisha");
    expect(totalErrors(errors)).toBe(1);
    expect(errors.refWords).toBe(5);
    expect(() => wordErrorsForText("...", "anything")).toThrow(/no words/);
  });
});

describe("audio files", () => {
  it("sorts files into sendable, unsupported and not audio", () => {
    expect(classifyFile("a.OPUS")).toEqual({ kind: "supported", mimeType: "audio/ogg" });
    expect(classifyFile("a.m4a")).toEqual({ kind: "supported", mimeType: "audio/mp4" });
    expect(classifyFile("a.amr")).toEqual({ kind: "unsupported" });
    expect(classifyFile("consent.csv")).toEqual({ kind: "not-audio" });
  });

  it("measures the length of a file itself", async () => {
    expect(await audioDurationSeconds(makeWav(2.5), "audio/wav")).toBeCloseTo(2.5, 2);
  });

  it("refuses a file that is not audio", async () => {
    await expect(audioDurationSeconds(new Uint8Array([1, 2, 3]), "audio/wav")).rejects.toThrow();
  });
});

describe("loading the recordings folder", () => {
  const consent = "file,consent_version,date\nrec_1.wav,pilot-v1,2026-11-20\nrec_2.wav,,2026-11-20\nrec_4.wav,pilot-v1,2026-11-20\nghost.wav,pilot-v1,2026-11-20\n";
  const reference = "file,speaker,speaker group,reference transcript,prompt\nrec_1.wav,s1,g1,hello there,Introduce yourself\nghost2.wav,s9,g1,x,\n";

  it("never lets a recording without a stored consent version through", async () => {
    const dir = await makeRecordingsDir({ "rec_1.wav": 1, "rec_2.wav": 1, "rec_3.wav": 1, "rec_4.wav": 1 }, consent, reference);
    await writeFile(join(dir, "voice.amr"), "x");
    const { items, refused, warnings } = await loadInputs(dir);

    expect(items.map((i) => i.file)).toEqual(["rec_1.wav", "rec_4.wav"]);
    expect(Object.fromEntries(refused.map((r) => [r.file, r.reason]))).toEqual({
      "rec_2.wav": expect.stringContaining("consent version is empty"),
      "rec_3.wav": expect.stringContaining("no row in consent.csv"),
      "voice.amr": expect.stringContaining("not supported"),
    });
    expect(items[0]).toMatchObject({ consentVersion: "pilot-v1", reference: { speaker: "s1", group: "g1", text: "hello there", task: "Introduce yourself" } });
    expect(items[1]?.reference).toBeNull();
    expect(warnings.join("\n")).toContain("rec_4.wav: no row in reference.csv");
    expect(warnings.join("\n")).toContain('lists "ghost.wav"');
    expect(warnings.join("\n")).toContain('lists "ghost2.wav"');
  });

  it("uses a default task when reference.csv does not say what was asked", async () => {
    const dir = await makeRecordingsDir({ "a.wav": 1 }, "file,consent_version,date\na.wav,v1,2026-11-20\n", "file,speaker,speaker_group,reference_transcript\na.wav,s1,g1,hello\n");
    expect((await loadInputs(dir)).items[0]?.reference?.task).toMatch(/job-interview/);
  });

  it("stops with a clear message when a file is missing, a column is missing or a row repeats", async () => {
    const empty = await tempDir();
    await expect(loadInputs(join(empty, "nope"))).rejects.toThrow(InputError);
    await expect(loadInputs(empty)).rejects.toThrow(/consent\.csv is missing/);

    const noReference = await tempDir();
    await writeFile(join(noReference, "consent.csv"), "file,consent_version,date\n");
    await expect(loadInputs(noReference)).rejects.toThrow(/reference\.csv is missing/);

    const noColumn = await makeRecordingsDir({}, "file,date\na.wav,2026-11-20\n", "file,speaker,speaker_group,reference_transcript\n");
    await expect(loadInputs(noColumn)).rejects.toThrow(/no "consent_version" column/);

    const repeated = await makeRecordingsDir({}, "file,consent_version,date\na.wav,v1,x\na.wav,v2,x\n", "file,speaker,speaker_group,reference_transcript\n");
    await expect(loadInputs(repeated)).rejects.toThrow(/more than once/);
  });
});
