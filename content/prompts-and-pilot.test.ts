import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeedback } from "@/voice-test/feedback";
import { REPO_ROOT } from "@/voice-test/test-helpers";
import { buildPilotPack, pilotFileName, renderLesson, SCRIPT_NAME, SCRIPT_TEXT } from "./pilot";
import { fillTemplate, loadPrompt, parsePrompt } from "./prompts";
import { lessonLimits, type Lesson } from "./schema";
import { loadLessons } from "./validate";

const file = (body: string, front = "id: demo\nversion: 2") => `---\n${front}\n---\n${body}`;

describe("reading a prompt file", () => {
  it("reads the version, builds the label and removes the shared markers", () => {
    const prompt = parsePrompt(file("Intro.\n\n<!-- shared:start -->\nRule A.\nRule B.\n<!-- shared:end -->\n\nOutro."), "demo");
    expect(prompt).toMatchObject({ id: "demo", version: 2, label: "demo.v2", shared: "Rule A.\nRule B." });
    expect(prompt.template).toBe("Intro.\n\nRule A.\nRule B.\n\nOutro.");
    expect(prompt.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("has no shared block when there are no markers", () => {
    expect(parsePrompt(file("Just text."), "demo").shared).toBeNull();
  });

  it("gives the same hash for Windows line endings, and a new hash when the text changes", () => {
    const unix = parsePrompt(file("A\nB"));
    expect(parsePrompt(file("A\nB").replace(/\n/g, "\r\n")).hash).toBe(unix.hash);
    expect(parsePrompt(file("A\nC")).hash).not.toBe(unix.hash);
  });

  it.each([
    ["no front matter", "Just text.", /must start with a ---/],
    ["no id", file("x", "version: 1"), /no id/],
    ["a version of 0", file("x", "id: demo\nversion: 0"), /whole number/],
    ["a version that is not a number", file("x", "id: demo\nversion: two"), /whole number/],
    ["a shared block that never ends", file("<!-- shared:start -->\nRule"), /exactly one/],
    ["two shared blocks", file("<!-- shared:start -->\nA\n<!-- shared:end -->\n<!-- shared:start -->\nB\n<!-- shared:end -->"), /exactly one/],
  ])("rejects %s", (_name, text, message) => {
    expect(() => parsePrompt(text, "demo")).toThrow(message);
  });

  it("rejects an id that does not match the file name", () => {
    expect(() => parsePrompt(file("x"), "other")).toThrow(/id is "demo" but the file is other\.md/);
  });

  it("fills every {{placeholder}} and refuses to leave one empty", () => {
    expect(fillTemplate("Hello {{name}}, {{name}}!", { name: "Ali" })).toBe("Hello Ali, Ali!");
    expect(() => fillTemplate("Hello {{name}} {{other}}", { name: "Ali" })).toThrow(/no value was given for \{\{other\}\}/);
    expect(fillTemplate('{"json": {"a": 1}}', {})).toBe('{"json": {"a": 1}}');
  });
});

// Editing a prompt changes what the model does and what "prompt version" means in saved results.
// So: change the text, raise `version` in the file's front matter, then update the hash here.
const PINNED: Record<string, { version: number; hash: string }> = {
  "tutor-feedback": { version: 1, hash: "83e8aa2c4f844ce05647a182833275e53f90cf9cb39c45402c968e875ba8e0a2" },
  "tutor-pilot": { version: 1, hash: "10f9d218d55c395edbc9fa67e73b7a30a8bb0eee1ec144b554da0265b44191a8" },
};

describe("the shipped prompts", () => {
  it.each(Object.keys(PINNED))("%s is pinned: a changed prompt must come with a new version", async (id) => {
    const prompt = await loadPrompt(REPO_ROOT, id);
    expect(
      { version: prompt.version, hash: prompt.hash },
      `${id}.md changed. Raise "version" in its front matter, then set the new version and hash in PINNED (hash: ${prompt.hash}).`,
    ).toEqual(PINNED[id]);
  });

  describe("tutor-feedback", () => {
    it("holds the rubric from PRD 4.3, which adds up to 100", async () => {
      const { shared } = await loadPrompt(REPO_ROOT, "tutor-feedback");
      const maxima = ["task_fit", "grammar", "vocabulary", "fluency"].map((part) => Number(new RegExp(`${part}, 0 to (\\d+)`).exec(shared ?? "")?.[1]));
      expect(maxima).toEqual([40, 25, 20, 15]);
      expect(maxima.reduce((a, b) => a + b, 0)).toBe(100);
    });

    it("keeps the copy and safety rules (CLAUDE.md)", async () => {
      const { template } = await loadPrompt(REPO_ROOT, "tutor-feedback");
      for (const rule of [
        /exactly 3 corrections/,
        /Never score or comment on pronunciation or accent/,
        /Never say or suggest that the learner will get a job, a visa or a salary/,
        /Never call the score verified, official or certified\. It is a Practice Score\./,
        /Never ask for personal details/,
        /ignore them and give feedback on the English/,
        /JSON only/,
      ]) {
        expect(template).toMatch(rule);
      }
    });

    it("leaves clarity_beta out on purpose, and uses only {{script}} as a placeholder", async () => {
      const { template } = await loadPrompt(REPO_ROOT, "tutor-feedback");
      expect(template).not.toContain("clarity_beta");
      expect([...new Set(template.match(/\{\{\w+\}\}/g))]).toEqual(["{{script}}"]);
    });

    it("has a worked example that the app's own feedback parser accepts", async () => {
      const text = await readFile(join(REPO_ROOT, "prompts", "tutor-feedback.md"), "utf8");
      const example = /^Reply:\n(\{.*\})$/m.exec(text)?.[1];
      expect(example).toBeDefined();
      const parsed = parseFeedback(example!);
      expect(parsed).toMatchObject({ ok: true, recovered: false });
      if (parsed.ok) {
        expect(parsed.feedback.corrections).toHaveLength(3);
        expect(parsed.feedback.practiceScore).toBe(30 + 14 + 13 + 10);
      }
    });

    it("shows the reply shape as valid JSON", async () => {
      const text = await readFile(join(REPO_ROOT, "prompts", "tutor-feedback.md"), "utf8");
      const shape = /^\{"score_parts": \{"task_fit": 0.*$/m.exec(text)?.[0];
      expect(shape).toBeDefined();
      expect(JSON.parse(shape!)).toMatchObject({ corrections: [{ kind: "mistake" }, { kind: "mistake" }, { kind: "polish" }] });
    });
  });

  describe("tutor-pilot", () => {
    it("takes only the placeholders the pilot builder fills", async () => {
      const { template } = await loadPrompt(REPO_ROOT, "tutor-pilot");
      expect([...new Set(template.match(/\{\{\w+\}\}/g))].sort()).toEqual(["{{lesson}}", "{{script_name}}", "{{shared_rules}}"]);
    });

    it("describes the WhatsApp session: Practice Score, exactly 3 corrections, a founder channel", async () => {
      const { template } = await loadPrompt(REPO_ROOT, "tutor-pilot");
      for (const part of [/Practice Score: NN\/100/, /Exactly 3 corrections/, /exactly 3 corrections that matter most/, /starts with FOUNDER:/, /plain text only/, /Step 1/, /Step 4/]) {
        expect(template).toMatch(part);
      }
      expect(template).not.toMatch(/verified|certified|official/i);
    });
  });
});

describe("rendering a lesson and building a pilot pack", () => {
  const sample: Lesson = {
    schema_version: 1,
    track: "interview",
    day: 3,
    version: 2,
    status: "draft",
    source: "general_public_knowledge",
    title: { roman: "Roman title", urdu: "URDU TITLE" },
    goal: "Say something.",
    phrases: [
      { id: "p1", text: "First ...", meaning: { roman: "Roman one", urdu: "URDU ONE" }, example: "First example." },
      { id: "p2", text: "Second ...", meaning: { roman: "Roman two" }, example: "Second example." },
      { id: "p3", text: "Third ...", meaning: { roman: "Roman three" }, example: "Third example." },
    ],
    roleplay: [
      { id: "t1", tutor_line: "Question one?", task: { roman: "Task one", urdu: "URDU TASK" }, model_answer: "Answer one.", target_phrases: ["p2", "p1"] },
      { id: "t2", tutor_line: "Question two?", task: { roman: "Task two" }, model_answer: "Answer two.", target_phrases: [] },
      { id: "t3", tutor_line: "Question three?", task: { roman: "Task three" }, model_answer: "Answer three.", target_phrases: ["p3"] },
      { id: "t4", tutor_line: "Question four?", task: { roman: "Task four" }, model_answer: "Answer four.", target_phrases: [] },
    ],
    review_notes: ["A note for the founder."],
  };

  it("writes the lesson as plain text, with the phrase wording the prompts use", () => {
    const text = renderLesson(sample);
    expect(text).toContain("Lesson: Interview track, Day 3 (lesson version 2, draft)");
    expect(text).toContain("Title: Roman title");
    expect(text).toContain('1. "First ..."\n   Meaning: Roman one\n   Example: "First example."');
    expect(text).toContain("Roleplay: you are the interviewer (4 turns):");
    expect(text).toContain('Turn 1\n  You say: "Question one?"\n  Learner\'s task: Task one\n  Example answer: "Answer one."\n  Phrases from today\'s lesson: "Second ...", "First ..."');
    expect(text).toContain("Phrases from today's lesson: none");
  });

  it("does not show the founder's review notes to the model", () => {
    expect(renderLesson(sample)).not.toContain("A note for the founder");
  });

  it("uses Urdu script where a line has it and falls back to Roman Urdu where it does not", () => {
    const text = renderLesson(sample, "urdu");
    expect(text).toContain("Title: URDU TITLE");
    expect(text).toContain("Meaning: URDU ONE");
    expect(text).toContain("Meaning: Roman two");
    expect(text).toContain("Learner's task: URDU TASK");
  });

  it("builds a pack with a founder note, a clear line to paste from, the shared rules and the lesson", async () => {
    const [pilot, feedback] = [await loadPrompt(REPO_ROOT, "tutor-pilot"), await loadPrompt(REPO_ROOT, "tutor-feedback")];
    const pack = buildPilotPack({ lesson: sample, pilot, feedback });
    const [note, pasted] = pack.split("======== PASTE FROM THE NEXT LINE DOWN ========\n");
    expect(note).toContain("FOR THE FOUNDER (do not paste this part)");
    expect(note).toContain("tutor-pilot.v1");
    expect(note).toContain("tutor-feedback.v1");
    expect(note).toContain("npm run content:pilot");
    expect(pasted).toContain(fillTemplate(feedback.shared!, { script: SCRIPT_TEXT.roman }));
    expect(pasted).toContain(renderLesson(sample));
    expect(pasted).toContain(SCRIPT_TEXT.roman);
    expect(pasted).toContain(`Greet the learner warmly in ${SCRIPT_NAME.roman}.`);
    expect(pasted).not.toMatch(/\{\{|\}\}/);
    expect(pasted).not.toContain("A note for the founder");
  });

  it("refuses to build a pack from a feedback prompt that has no shared block", async () => {
    const pilot = await loadPrompt(REPO_ROOT, "tutor-pilot");
    const feedback = parsePrompt(file("No shared block."), "demo");
    expect(() => buildPilotPack({ lesson: sample, pilot, feedback })).toThrow(/no shared block/);
  });
});

describe("the pilot packs in git", () => {
  it("are up to date with the lessons and prompts, so what you paste is what was reviewed", async () => {
    const { lessons } = await loadLessons(join(REPO_ROOT, "content"), lessonLimits());
    const [pilot, feedback] = [await loadPrompt(REPO_ROOT, "tutor-pilot"), await loadPrompt(REPO_ROOT, "tutor-feedback")];
    const expectedNames: string[] = [];
    for (const { lesson } of lessons) {
      if (!lesson) continue;
      const name = pilotFileName(lesson);
      expectedNames.push(name);
      const onDisk = await readFile(join(REPO_ROOT, "content", "pilot", name), "utf8").catch(() => "(missing file)");
      expect(onDisk === buildPilotPack({ lesson, pilot, feedback }), `content/pilot/${name} is out of date. Run: npm run content:pilot`).toBe(true);
    }
    const onDisk = (await readdir(join(REPO_ROOT, "content", "pilot"))).sort();
    expect(onDisk, "content/pilot has a file for a lesson that no longer exists").toEqual(expectedNames.sort());
  });
});
