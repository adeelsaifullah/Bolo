import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { removeTempDirs, tempDir } from "@/voice-test/test-helpers";
import { lessonLimits } from "./schema";
import { loadLessons, missingDays, parseJsonText, validateLesson } from "./validate";

afterEach(removeTempDirs);

const limits = lessonLimits();

const phrase = (n: number) => ({ id: `p${n}`, text: `Phrase ${n} ...`, meaning: { roman: `Matlab ${n}` }, example: `Example ${n}.` });
const turn = (n: number, targets: string[]) => ({
  id: `t${n}`,
  tutor_line: `Tutor line ${n}?`,
  task: { roman: `Kaam ${n}` },
  model_answer: `Answer ${n}.`,
  target_phrases: targets,
});

type Json = Record<string, unknown>;

/** A lesson that passes every check. Tests change one thing at a time. */
function lesson(overrides: Json = {}): Json {
  return {
    schema_version: 1,
    track: "interview",
    day: 1,
    version: 1,
    status: "draft",
    source: "general_public_knowledge",
    title: { roman: "Title" },
    goal: "Goal.",
    phrases: [1, 2, 3].map(phrase),
    roleplay: [turn(1, ["p1"]), turn(2, ["p2"]), turn(3, ["p3"]), turn(4, [])],
    review_notes: [],
    ...overrides,
  };
}

const words = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("the lesson format", () => {
  it("accepts a complete lesson, with or without Urdu script", () => {
    expect(validateLesson(lesson(), limits)).toMatchObject({ issues: [], lesson: { track: "interview", day: 1 } });
    const withUrdu = lesson({ title: { roman: "Title", urdu: "عنوان" } });
    expect(validateLesson(withUrdu, limits).issues).toEqual([]);
  });

  it.each<[string, Json, string, RegExp]>([
    ["an unknown track", { track: "gulf" }, "track", /must be one of: interview, callcenter/],
    ["day 0", { day: 0 }, "day", /.+/],
    ["a day past the end of the track", { day: 31 }, "day", /.+/],
    ["a version of 0", { version: 0 }, "version", /.+/],
    ["a status that is not draft or approved", { status: "published" }, "status", /.+/],
    ["a source other than general public knowledge", { source: "employer_question_bank" }, "source", /.+/],
    ["a schema version it does not know", { schema_version: 2 }, "schema_version", /.+/],
    ["an empty title", { title: { roman: "  " } }, "title.roman", /must not be empty/],
    ["a missing goal", { goal: "" }, "goal", /must not be empty/],
    ["an unknown field", { surprise: true }, "(root)", /surprise/],
    ["two phrases", { phrases: [1, 2].map(phrase) }, "phrases", /.+/],
    ["five phrases", { phrases: [1, 2, 3, 4, 5].map(phrase) }, "phrases", /.+/],
    ["three turns", { roleplay: [turn(1, ["p1"]), turn(2, ["p2"]), turn(3, ["p3"])] }, "roleplay", /.+/],
    ["seven turns", { roleplay: [1, 2, 3, 4, 5, 6, 7].map((n) => turn(n, n <= 3 ? [`p${n}`] : [])) }, "roleplay", /.+/],
    ["an empty review note", { review_notes: [""] }, "review_notes.0", /must not be empty/],
  ])("rejects %s", (_name, change, path, message) => {
    const { lesson: parsed, issues } = validateLesson(lesson(change), limits);
    expect(parsed).toBeNull();
    expect(issues.find((i) => i.path === path)?.message ?? JSON.stringify(issues)).toMatch(message);
  });

  it("rejects ids that are used twice", () => {
    const twice = lesson({ phrases: [phrase(1), { ...phrase(2), id: "p1" }, phrase(3)] });
    expect(validateLesson(twice, limits).issues).toContainEqual({ path: "phrases.1.id", message: '"p1" is used twice' });
    const turns = lesson({ roleplay: [turn(1, ["p1"]), { ...turn(2, ["p2"]), id: "t1" }, turn(3, ["p3"]), turn(4, [])] });
    expect(validateLesson(turns, limits).issues).toContainEqual({ path: "roleplay.1.id", message: '"t1" is used twice' });
  });

  it("rejects ids that do not look like p1 and t1", () => {
    expect(validateLesson(lesson({ phrases: [{ ...phrase(1), id: "one" }, phrase(2), phrase(3)] }), limits).issues[0]?.path).toBe("phrases.0.id");
  });

  it("rejects a target phrase that does not exist, or is listed twice in a turn", () => {
    const missing = lesson({ roleplay: [turn(1, ["p1", "p9"]), turn(2, ["p2"]), turn(3, ["p3"]), turn(4, [])] });
    expect(validateLesson(missing, limits).issues).toContainEqual({ path: "roleplay.0.target_phrases.1", message: '"p9" is not a phrase in this lesson' });
    const twice = lesson({ roleplay: [turn(1, ["p1", "p1"]), turn(2, ["p2"]), turn(3, ["p3"]), turn(4, [])] });
    expect(validateLesson(twice, limits).issues).toContainEqual({ path: "roleplay.0.target_phrases.1", message: '"p1" is listed twice in this turn' });
  });

  it("rejects a phrase that is taught but never practised", () => {
    const unused = lesson({ roleplay: [turn(1, ["p1"]), turn(2, ["p2"]), turn(3, []), turn(4, [])] });
    expect(validateLesson(unused, limits).issues).toContainEqual({ path: "phrases.2", message: '"p3" is taught but no roleplay turn lists it in target_phrases' });
  });

  it("limits the tutor's line and the model answer by words, using the numbers in config", () => {
    const longLine = lesson({ roleplay: [{ ...turn(1, ["p1"]), tutor_line: words(limits.tutorLineMaxWords + 1) }, turn(2, ["p2"]), turn(3, ["p3"]), turn(4, [])] });
    expect(validateLesson(longLine, limits).issues[0]).toMatchObject({ path: "roleplay.0.tutor_line", message: "must be at most 30 words" });
    const longAnswer = lesson({ roleplay: [{ ...turn(1, ["p1"]), model_answer: words(limits.modelAnswerMaxWords + 1) }, turn(2, ["p2"]), turn(3, ["p3"]), turn(4, [])] });
    expect(validateLesson(longAnswer, limits).issues[0]).toMatchObject({ path: "roleplay.0.model_answer", message: "must be at most 90 words" });
    const atTheLimit = lesson({ roleplay: [{ ...turn(1, ["p1"]), tutor_line: words(limits.tutorLineMaxWords) }, turn(2, ["p2"]), turn(3, ["p3"]), turn(4, [])] });
    expect(validateLesson(atTheLimit, limits).issues).toEqual([]);
  });

  it("does not let a lesson be approved while it has open review notes", () => {
    const open = lesson({ status: "approved", review_notes: ["Is this right?"] });
    expect(validateLesson(open, limits).issues).toContainEqual({ path: "review_notes", message: expect.stringContaining("must be empty before a lesson is approved") });
    expect(validateLesson(lesson({ status: "approved" }), limits).issues).toEqual([]);
    expect(validateLesson(lesson({ status: "draft", review_notes: ["Is this right?"] }), limits).issues).toEqual([]);
  });

  it("can require Urdu script on every Urdu line, for the check before launch", () => {
    expect(validateLesson(lesson(), limits, { requireUrdu: true }).issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["title.urdu", "phrases.0.meaning.urdu", "roleplay.0.task.urdu"]),
    );
    const ur = (roman: string) => ({ roman, urdu: "اردو" });
    const complete = lesson({
      title: ur("Title"),
      phrases: [1, 2, 3].map((n) => ({ ...phrase(n), meaning: ur(`Matlab ${n}`) })),
      roleplay: [turn(1, ["p1"]), turn(2, ["p2"]), turn(3, ["p3"]), turn(4, [])].map((t) => ({ ...t, task: ur("Kaam") })),
    });
    expect(validateLesson(complete, limits, { requireUrdu: true }).issues).toEqual([]);
  });
});

describe("reading a lesson file by hand", () => {
  it("says the line and column of a JSON mistake", () => {
    const result = parseJsonText('{\n  "a": 1\n  "b": 2\n}');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issue.message).toMatch(/line 3, column 3/);
    expect(!result.ok && result.issue.message).toMatch(/missing comma or quote/);
  });

  it("parses good JSON", () => {
    expect(parseJsonText('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
  });
});

describe("loading the content folder", () => {
  async function folder(files: Record<string, string>): Promise<string> {
    const dir = await tempDir("bolo-content-");
    for (const [name, text] of Object.entries(files)) {
      await mkdir(join(dir, name, ".."), { recursive: true });
      await writeFile(join(dir, name), text);
    }
    return dir;
  }
  const json = (overrides: Json = {}) => JSON.stringify(lesson(overrides));

  it("loads good lessons in day order and ignores a track with no folder", async () => {
    const dir = await folder({ "interview/day-02.json": json({ day: 2 }), "interview/day-01.json": json() });
    const { lessons, problems } = await loadLessons(dir, limits);
    expect(problems).toEqual([]);
    expect(lessons.map((l) => [l.file, l.lesson?.day])).toEqual([["interview/day-01.json", 1], ["interview/day-02.json", 2]]);
  });

  it("reports a file whose day or track does not match its name or folder", async () => {
    const dir = await folder({ "interview/day-01.json": json({ day: 5 }), "callcenter/day-01.json": json() });
    const { lessons } = await loadLessons(dir, limits);
    const byFile = Object.fromEntries(lessons.map((l) => [l.file, l]));
    expect(byFile["interview/day-01.json"]?.issues).toContainEqual({ path: "day", message: "is 5 but the file is called day-01.json" });
    expect(byFile["interview/day-01.json"]?.lesson).toBeNull();
    expect(byFile["callcenter/day-01.json"]?.issues).toContainEqual({ path: "track", message: 'is "interview" but the file is in the callcenter folder' });
  });

  it("reports badly named files, broken JSON and invalid lessons without stopping", async () => {
    const dir = await folder({
      "interview/day-01.json": json(),
      "interview/notes.txt": "hello",
      "interview/day-1.json": json(),
      "interview/day-03.json": '{"day": 3,',
      "interview/day-04.json": json({ day: 4, phrases: [] }),
    });
    const { lessons, problems } = await loadLessons(dir, limits);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("interview/notes.txt");
    expect(problems.join("\n")).toContain("interview/day-1.json");
    expect(lessons.find((l) => l.file === "interview/day-03.json")?.issues[0]?.message).toMatch(/not valid JSON/);
    expect(lessons.find((l) => l.file === "interview/day-04.json")?.issues.length).toBeGreaterThan(0);
    expect(lessons.find((l) => l.file === "interview/day-01.json")?.lesson).not.toBeNull();
  });

  it("scans for copy-rule problems even in a lesson that has other errors", async () => {
    const dir = await folder({ "interview/day-01.json": json({ goal: "Get a visa fast.", phrases: [] }) });
    const [entry] = (await loadLessons(dir, limits)).lessons;
    expect(entry?.lesson).toBeNull();
    expect(entry?.findings).toContainEqual(expect.objectContaining({ rule: "visa", severity: "error", path: "goal" }));
  });

  it("lists the days a track is missing", async () => {
    const dir = await folder({ "interview/day-01.json": json(), "interview/day-03.json": json({ day: 3 }) });
    const { lessons } = await loadLessons(dir, limits);
    expect(missingDays(lessons, "interview", 4)).toEqual([2, 4]);
    expect(missingDays(lessons, "callcenter", 2)).toEqual([1, 2]);
  });
});
