import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { requireConfig } from "@/lib/config";
import { REPO_ROOT } from "@/voice-test/test-helpers";
import { lessonLimits } from "./schema";
import { loadLessons, missingDays } from "./validate";

const limits = lessonLimits();
const loaded = await loadLessons(join(REPO_ROOT, "content"), limits);

describe("the lessons in git", () => {
  it("have no folder problems and every file is a valid lesson", () => {
    expect(loaded.problems).toEqual([]);
    for (const entry of loaded.lessons) expect(entry.issues, entry.file).toEqual([]);
    expect(loaded.lessons.length).toBeGreaterThan(0);
  });

  it("break none of the copy rules in CLAUDE.md", () => {
    for (const entry of loaded.lessons) {
      const errors = entry.findings.filter((f) => f.severity === "error");
      expect(errors, `${entry.file}: ${errors.map((f) => `${f.path} "${f.match}" (${f.why})`).join("; ")}`).toEqual([]);
    }
  });

  it("include every launch day of the interview track", () => {
    const launchDays = requireConfig("app", "lessons.launch_days_per_track");
    expect(missingDays(loaded.lessons, "interview", launchDays)).toEqual([]);
  });

  it("are all general public knowledge, and a lesson is only approved once its review notes are cleared", () => {
    for (const { file, lesson } of loaded.lessons) {
      expect(lesson?.source, file).toBe("general_public_knowledge");
      if (lesson?.status === "approved") expect(lesson.review_notes, file).toEqual([]);
    }
  });

  it("use only the Roman Urdu spellings the app already uses (-ein endings), not -iye", () => {
    // config/strings.json writes "karein"; keep the lessons consistent with it.
    for (const { file, lesson } of loaded.lessons) {
      const text = JSON.stringify(lesson);
      expect(text, file).not.toMatch(/\b(?:kijiye|kijiey|batayiye|boliye|likhiye)\b/i);
    }
  });
});
