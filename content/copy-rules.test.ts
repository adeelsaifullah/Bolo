import { describe, expect, it } from "vitest";
import { RULES, scanText, scanValue } from "./copy-rules";

// Urdu script, written as escapes so the test cannot be damaged by an editor.
const URDU = {
  gulf: "خلیج", // khaleej
  visa: "ویزا",
  guarantee: "گارنٹی",
  bail: "ضمانت",
  verified: "تصدیق شدہ",
  idCard: "شناختی کارڈ",
  salary: "تنخواہ",
};

const rulesFound = (text: string, severity?: "error" | "review"): string[] =>
  scanText(text)
    .filter((f) => severity === undefined || f.severity === severity)
    .map((f) => f.rule);

describe("copy rules that are errors (CLAUDE.md: never write or generate)", () => {
  it.each<[string, string[]]>([
    ["gulf-wording", ["Jobs in Dubai", "a Gulf job", "Work in Saudi Arabia", "Riyadh office", "UAE interview", "Khaleej mein kaam", URDU.gulf]],
    ["visa", ["Get your visa", "Visa support", "visas", URDU.visa]],
    ["guarantee", ["guaranteed result", "We guarantee it", "A guarantee", "Ye garanti hai", URDU.guarantee, URDU.bail]],
    ["job-promise", ["You will get the job", "you'll definitely get hired", "You are sure to land a position", "You will surely get this offer", "Naukri milegi", "naukri pakki"]],
    ["official-claim", ["A verified score", "Certified report", "an official result", "Your certificate", "accredited by", URDU.verified]],
    ["price-comparison", ["10x cheaper than a tutor", "10 x cheaper", "cheaper than a teacher"]],
    ["cnic", ["Send your CNIC", "your national ID", "National Identity number", URDU.idCard]],
    ["pronunciation-score", ["Your pronunciation score", "pronunciation marks", "an accent score"]],
    ["placeholder", ["TODO: fix this", "TBD", "tell me ???"]],
  ])("%s catches its wording", (rule, examples) => {
    for (const text of examples) expect(rulesFound(text, "error"), text).toContain(rule);
  });

  it("does not flag ordinary interview English", () => {
    for (const text of [
      "My name is Ayesha. I am from Lahore. I am good at working with people.",
      "I have a degree in computer science and I studied at a university in Karachi.",
      "A woman asked me a question.", // "oman" inside a word is not a country
      "I would be happy to start with any task you give me.",
      "Could you tell me more about the training?",
      "I can start from the first of next month.",
    ]) {
      expect(scanText(text), text).toEqual([]);
    }
  });
});

describe("copy rules that ask a person to read the sentence", () => {
  it.each<[string, string[]]>([
    ["salary", ["What are your salary expectations?", "salaries", "Tankhwah ki baat", "meri tankha", URDU.salary]],
    ["hired-or-selected", ["Why should we hire you?", "You were selected", "a job offer", "your hiring manager", "shortlisted"]],
    ["pronunciation", ["Your pronunciation is good", "a strong accent", "how to pronounce it"]],
    ["percent-claim", ["I give 100% in my work", "a hundred percent"]],
  ])("%s is a review, not an error", (rule, examples) => {
    for (const text of examples) {
      expect(rulesFound(text, "review"), text).toContain(rule);
      expect(rulesFound(text, "error"), text).toEqual([]);
    }
  });
});

describe("scanning a whole lesson", () => {
  it("finds text anywhere in nested JSON and says where", () => {
    const lesson = {
      goal: "Talk about a visa.",
      phrases: [{ text: "fine" }, { meaning: { roman: "Yeh verified hai" } }],
      roleplay: [{ model_answer: "What are your salary expectations?", target_phrases: ["p1"] }],
      day: 3,
    };
    expect(scanValue(lesson).map((f) => [f.path, f.rule])).toEqual([
      ["goal", "visa"],
      ["phrases.1.meaning.roman", "official-claim"],
      ["roleplay.0.model_answer", "salary"],
    ]);
  });

  it("returns nothing for text with no problems, numbers or nulls", () => {
    expect(scanValue({ a: "hello", b: [1, null, true], c: { d: "world" } })).toEqual([]);
  });

  it("gives every rule a plain-words reason", () => {
    expect(RULES.length).toBeGreaterThanOrEqual(13);
    for (const rule of RULES) expect(rule.why.length).toBeGreaterThan(5);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });
});
