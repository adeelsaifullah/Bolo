// The CLAUDE.md copy and safety rules, as a scanner over lesson text.
// "error" = the rule forbids it: fix it. "review" = often fine (for example "salary" as interview vocabulary) but a
// person must look at the sentence. A scanner cannot judge meaning, so a clean scan is not a substitute for reading.

export type Severity = "error" | "review";

export interface Rule {
  id: string;
  severity: Severity;
  pattern: RegExp;
  /** What the rule protects, in plain words. */
  why: string;
}

export const RULES: readonly Rule[] = [
  // --- errors: CLAUDE.md "Never write or generate" and "Never collect" ---
  {
    id: "gulf-wording",
    severity: "error",
    pattern: /\b(?:gulf|khaleej|khaleeji|middle east|dubai|abu dhabi|sharjah|saudi|riyadh|jeddah|doha|qatar|kuwait|bahrain|muscat|oman|uae)\b|خلیج/i,
    why: 'no "Gulf job" wording in Phase 1',
  },
  { id: "visa", severity: "error", pattern: /\bvisas?\b|ویزا/i, why: "no visa promise or visa talk" },
  {
    id: "guarantee",
    severity: "error",
    pattern: /\bguarant(?:ee|eed|ees|y)\b|\bgarant(?:ee|i)\b|گارنٹی|ضمانت/i,
    why: "no promise of an outcome",
  },
  {
    id: "job-promise",
    severity: "error",
    pattern:
      /\byou(?:'ll| will| are going to| are sure to| can be sure (?:to|of))\b[^.!?\n]{0,40}\b(?:get|land|win|secure|be offered|be hired|be selected)\b[^.!?\n]{0,30}\b(?:job|offer|position|role|post)\b|\b(?:will|'ll)\s+(?:definitely|surely|certainly|for sure)\s+(?:get|be hired|be selected)\b|\bnaukri\s+(?:mil\s*(?:jaye|jaegi|jayegi)|milegi|pakki)\b/i,
    why: "no job promise",
  },
  {
    id: "official-claim",
    severity: "error",
    pattern: /\b(?:verified|certified|official(?:ly)?|accredited|certificate|certification)\b|تصدیق شدہ/i,
    why: 'a score or report is never "verified", "official" or "certified"',
  },
  {
    id: "price-comparison",
    severity: "error",
    pattern: /\b10\s?x\b|cheaper than (?:a |an )?(?:tutor|teacher|academy|class|course)/i,
    why: 'no "10x cheaper than a tutor" claim',
  },
  { id: "cnic", severity: "error", pattern: /\bcnic\b|national id(?:entity)?\b|شناختی کارڈ/i, why: "never collect CNIC numbers" },
  {
    id: "pronunciation-score",
    severity: "error",
    pattern: /\bpronunciation\s+(?:score|mark|marks|grade|rating|test)\b|\baccent\s+(?:score|mark|grade|rating)\b/i,
    why: "no pronunciation score is shown anywhere",
  },
  { id: "placeholder", severity: "error", pattern: /\b(?:TODO|TBD|FIXME|XXX)\b|\?\?\?/, why: "no unfinished placeholder text" },

  // --- review: allowed in teaching content, but read the sentence ---
  { id: "salary", severity: "review", pattern: /\bsalar(?:y|ies)\b|\btankh?w?ah?\b|تنخواہ/i, why: "fine as interview vocabulary, never as a promise of pay" },
  {
    id: "hired-or-selected",
    severity: "review",
    pattern: /\b(?:hire|hired|hiring|selected|selection|shortlist(?:ed)?|job offer|offer letter)\b/i,
    why: "fine in an interviewer's question, never as an outcome promised to the learner",
  },
  { id: "pronunciation", severity: "review", pattern: /\bpron(?:ou|u)nc\w*|\baccent\b/i, why: "pronunciation is never scored or promised" },
  { id: "percent-claim", severity: "review", pattern: /\b100\s?%|\bhundred percent\b/i, why: "fine inside a learner's answer, never as a claim about Bolo" },
];

export interface Finding {
  rule: string;
  severity: Severity;
  /** The text that matched. */
  match: string;
  why: string;
}

export interface LocatedFinding extends Finding {
  /** Where it was found, for example "roleplay.2.model_answer". */
  path: string;
}

/** Every rule that matches the text. */
export function scanText(text: string): Finding[] {
  return RULES.flatMap((rule) => {
    const match = rule.pattern.exec(text);
    return match ? [{ rule: rule.id, severity: rule.severity, match: match[0], why: rule.why }] : [];
  });
}

/** Scans every string anywhere inside a JSON value, and says where each finding is. */
export function scanValue(value: unknown, path = ""): LocatedFinding[] {
  if (typeof value === "string") return scanText(value).map((finding) => ({ ...finding, path: path || "(root)" }));
  if (Array.isArray(value)) return value.flatMap((item, index) => scanValue(item, path ? `${path}.${index}` : String(index)));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => scanValue(item, path ? `${path}.${key}` : key));
  }
  return [];
}
