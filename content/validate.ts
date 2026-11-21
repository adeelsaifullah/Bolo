import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { scanValue, type LocatedFinding } from "./copy-rules";
import { createLessonSchema, type Lesson, type LessonLimits, type SchemaOptions } from "./schema";

export interface LessonIssue {
  /** Field path such as "phrases.2.meaning.roman", or "(file)". */
  path: string;
  message: string;
}

const DAY_FILE = /^day-(\d{2})\.json$/;

export const lessonFileName = (day: number): string => `day-${String(day).padStart(2, "0")}.json`;

/** Parses JSON text and, on a syntax error, says the line and column so a hand edit is easy to fix. */
export function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false; issue: LessonIssue } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    const position = /position (\d+)/.exec(error instanceof Error ? error.message : "");
    let where = "";
    if (position) {
      const before = text.slice(0, Number(position[1]));
      where = ` at line ${before.split("\n").length}, column ${before.length - before.lastIndexOf("\n")}`;
    }
    return {
      ok: false,
      issue: {
        path: "(file)",
        message: `not valid JSON${where}. Look for a missing comma or quote, or a " inside a text that needs a backslash before it.`,
      },
    };
  }
}

/** Checks one parsed lesson against the format. */
export function validateLesson(raw: unknown, limits: LessonLimits, options?: SchemaOptions): { lesson: Lesson | null; issues: LessonIssue[] } {
  const result = createLessonSchema(limits, options).safeParse(raw);
  if (result.success) return { lesson: result.data, issues: [] };
  return {
    lesson: null,
    issues: result.error.issues.map((issue) => ({ path: issue.path.map(String).join(".") || "(root)", message: issue.message })),
  };
}

export interface LoadedLesson {
  /** Relative to the content folder, for example "interview/day-03.json". */
  file: string;
  /** null when the file has errors. */
  lesson: Lesson | null;
  issues: LessonIssue[];
  /** Copy-rule findings. Scanned from the raw text, so they show even when the lesson has other errors. */
  findings: LocatedFinding[];
}

export interface LoadedLessons {
  lessons: LoadedLesson[];
  /** Problems with the folders themselves, such as a file with the wrong name. */
  problems: string[];
}

/** Reads and checks every `content/<track>/day-NN.json`. Never throws for a bad lesson: the result lists what is wrong. */
export async function loadLessons(contentDir: string, limits: LessonLimits, options?: SchemaOptions): Promise<LoadedLessons> {
  const lessons: LoadedLesson[] = [];
  const problems: string[] = [];

  for (const track of limits.tracks) {
    let entries: string[];
    try {
      entries = (await readdir(join(contentDir, track))).sort();
    } catch {
      continue; // a track with no lessons yet
    }
    for (const name of entries) {
      const file = `${track}/${name}`;
      const match = DAY_FILE.exec(name);
      if (!match) {
        problems.push(`${file}: lesson files must be named day-01.json, day-02.json, ...`);
        continue;
      }
      const parsed = parseJsonText(await readFile(join(contentDir, track, name), "utf8"));
      if (!parsed.ok) {
        lessons.push({ file, lesson: null, issues: [parsed.issue], findings: [] });
        continue;
      }
      const { lesson, issues } = validateLesson(parsed.value, limits, options);
      if (lesson) {
        if (lesson.track !== track) issues.push({ path: "track", message: `is "${lesson.track}" but the file is in the ${track} folder` });
        if (lessonFileName(lesson.day) !== name) issues.push({ path: "day", message: `is ${lesson.day} but the file is called ${name}` });
      }
      lessons.push({ file, lesson: issues.length === 0 ? lesson : null, issues, findings: scanValue(parsed.value) });
    }
  }
  return { lessons, problems };
}

/** Days from 1 up to `days` that the track has no valid lesson for. */
export function missingDays(loaded: readonly LoadedLesson[], track: string, days: number): number[] {
  const have = new Set(loaded.filter((l) => l.lesson?.track === track).map((l) => l.lesson!.day));
  return Array.from({ length: days }, (_, i) => i + 1).filter((day) => !have.has(day));
}
