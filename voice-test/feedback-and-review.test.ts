import { describe, expect, it } from "vitest";
import { buildFeedbackRequest, loadFeedbackPrompt, parseFeedback } from "./feedback";
import { markKey, mergeReviewSheet, parseVerdict, readMarks, type ReviewRow } from "./review";
import { REPO_ROOT } from "./test-helpers";

const good = {
  score_parts: { task_fit: 30, grammar: 18, vocabulary: 14, fluency: 9 },
  corrections: [
    { kind: "mistake", said: "I am having 2 years", better: "I have 2 years", why: "Yahan have use hota hai." },
    { kind: "mistake", said: "since 2 year", better: "for 2 years", why: "for ke baad muddat aati hai." },
    { kind: "polish", said: "good in talking", better: "a confident speaker", why: "Zyada professional lagta hai." },
  ],
};

describe("the feedback prompt", () => {
  it("is the tutor prompt the app will ship, versioned, with the Urdu script slot", async () => {
    const prompt = await loadFeedbackPrompt(REPO_ROOT);
    expect(prompt.version).toBe("tutor-feedback.v1");
    expect(prompt.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prompt.template).toContain("{{script}}");
    expect(prompt.template).toMatch(/exactly 3 corrections/);
  });

  it("builds a request that carries only text, in the message format the prompt describes", async () => {
    const prompt = await loadFeedbackPrompt(REPO_ROOT);
    const request = buildFeedbackRequest(prompt, { script: "roman", question: "Introduce yourself", transcript: "my name is Ayesha and I like work", audioSeconds: 30 });
    expect(request.responseFormat).toBe("json");
    expect(request.system).not.toMatch(/\{\{|\}\}/);
    expect(request.system).toContain("Roman Urdu");
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.content).toBe(
      [
        "Lesson goal: General interview practice. This recording is not from a lesson.",
        "Interviewer said: Introduce yourself",
        "Learner's task: Answer the interviewer's question in English.",
        "Example answer: none",
        "Phrases from today's lesson: none",
        "Seconds spoken: 30",
        "Words per minute: 16",
        "Answer: my name is Ayesha and I like work",
      ].join("\n"),
    );
    expect(buildFeedbackRequest(prompt, { script: "urdu", question: "q", transcript: "hello", audioSeconds: 5 }).system).toContain("Urdu script");
  });

  it("says so when the question was not recorded", async () => {
    const prompt = await loadFeedbackPrompt(REPO_ROOT);
    const request = buildFeedbackRequest(prompt, { script: "roman", question: "", transcript: "hello", audioSeconds: 5 });
    expect(request.messages[0]?.content).toContain("Interviewer said: (the question was not recorded)");
  });
});

describe("reading the feedback reply", () => {
  it("accepts clean JSON and works out the Practice Score itself", () => {
    const parsed = parseFeedback(JSON.stringify(good));
    expect(parsed).toMatchObject({ ok: true, recovered: false });
    if (parsed.ok) {
      expect(parsed.feedback.practiceScore).toBe(71);
      expect(parsed.feedback.corrections).toHaveLength(3);
    }
  });

  it("ignores a score the model adds up itself", () => {
    const parsed = parseFeedback(JSON.stringify({ ...good, practice_score: 99 }));
    expect(parsed.ok && parsed.feedback.practiceScore).toBe(71);
  });

  it("recovers JSON from a code fence or extra words, and says it had to", () => {
    for (const reply of ["```json\n" + JSON.stringify(good) + "\n```", "Here you go: " + JSON.stringify(good) + " Hope it helps!"]) {
      expect(parseFeedback(reply)).toMatchObject({ ok: true, recovered: true });
    }
  });

  it.each([
    ["text that is not JSON", "Sorry, I cannot help", /not valid JSON/],
    ["two corrections", JSON.stringify({ ...good, corrections: good.corrections.slice(0, 2) }), /corrections/],
    ["four corrections", JSON.stringify({ ...good, corrections: [...good.corrections, good.corrections[0]] }), /corrections/],
    ["a part above its maximum", JSON.stringify({ ...good, score_parts: { ...good.score_parts, task_fit: 41 } }), /score_parts\.task_fit/],
    ["a part that is not a whole number", JSON.stringify({ ...good, score_parts: { ...good.score_parts, grammar: 12.5 } }), /score_parts\.grammar/],
    ["an unknown kind", JSON.stringify({ ...good, corrections: [{ ...good.corrections[0], kind: "other" }, ...good.corrections.slice(1)] }), /kind/],
    ["an empty explanation", JSON.stringify({ ...good, corrections: [{ ...good.corrections[0], why: " " }, ...good.corrections.slice(1)] }), /why/],
    ["no score parts", JSON.stringify({ corrections: good.corrections }), /score_parts/],
  ])("rejects %s", (_name, reply, reason) => {
    const parsed = parseFeedback(reply);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.reason).toMatch(reason);
  });
});

describe("marking corrections", () => {
  const rows: ReviewRow[] = [1, 2, 3].map((n) => ({ file: "a.wav", correction: n, kind: "mistake", said: `said ${n}`, better: `better ${n}`, why: `why ${n}` }));

  it("accepts right and wrong the way you might write them, including sahi and ghalat", () => {
    for (const word of ["right", "Right", " SAHI ", "yes", "y", "correct", "1"]) expect(parseVerdict(word)).toBe("right");
    for (const word of ["wrong", "Ghalat", "galat", "no", "n", "0"]) expect(parseVerdict(word)).toBe("wrong");
    expect(parseVerdict("")).toBe("unmarked");
    expect(parseVerdict("maybe")).toBe("invalid");
  });

  it("starts a sheet with the verdict column empty and the correction text beside it", () => {
    const { csv, cleared } = mergeReviewSheet(null, rows);
    expect(cleared).toBe(0);
    expect(csv.split("\n")[0]).toBe("file,correction,verdict,kind,said,better,why");
    expect(csv.split("\n")[1]).toBe("a.wav,1,,mistake,said 1,better 1,why 1");
    expect(readMarks(csv).marks.size).toBe(0);
  });

  it("keeps marks on a re-run, adds new rows and never drops rows of other files", () => {
    const marked = mergeReviewSheet(null, rows).csv.replace("a.wav,1,,", "a.wav,1,right,").replace("a.wav,2,,", "a.wav,2,Ghalat,");
    const other: ReviewRow = { file: "b.wav", correction: 1, kind: "polish", said: "s", better: "b", why: "w" };
    const again = mergeReviewSheet(marked, [...rows, other]);

    expect(again.cleared).toBe(0);
    const { marks, invalid } = readMarks(again.csv);
    expect(marks.get(markKey("a.wav", 1))).toBe("right");
    expect(marks.get(markKey("a.wav", 2))).toBe("wrong");
    expect(marks.has(markKey("a.wav", 3))).toBe(false);
    expect(invalid).toEqual([]);
    expect(again.csv).toContain("b.wav,1,,polish");

    // a run limited to other files keeps a.wav's rows and marks
    expect(readMarks(mergeReviewSheet(again.csv, [other]).csv).marks.get(markKey("a.wav", 1))).toBe("right");
  });

  it("clears a mark when the correction it judged has changed", () => {
    const marked = mergeReviewSheet(null, rows).csv.replace("a.wav,1,,", "a.wav,1,right,");
    const changed = rows.map((r) => (r.correction === 1 ? { ...r, better: "a different fix" } : r));
    const again = mergeReviewSheet(marked, changed);
    expect(again.cleared).toBe(1);
    expect(readMarks(again.csv).marks.size).toBe(0);
    expect(again.csv).toContain("a different fix");
  });

  it("reports cells that are neither right nor wrong instead of counting them", () => {
    const sheet = mergeReviewSheet(null, rows).csv.replace("a.wav,3,,", "a.wav,3,maybe,");
    expect(readMarks(sheet).invalid).toEqual(['a.wav correction 3: "maybe"']);
  });
});
