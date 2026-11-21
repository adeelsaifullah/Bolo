import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import type { LlmRequest } from "@/lib/llm";

export const FEEDBACK_PROMPT_FILE = "prompts/voice-test-feedback.v0.md";

export type ScriptChoice = "roman" | "urdu";

const SCRIPT_TEXT: Record<ScriptChoice, string> = {
  roman: "Roman Urdu (Urdu written in English letters), with common everyday spellings, the way people type on WhatsApp",
  urdu: "Urdu script (اردو)",
};

export interface FeedbackPrompt {
  /** The prompt file's name without the extension, for example "voice-test-feedback.v0". Saved with every result. */
  version: string;
  template: string;
  /** Fingerprint of the file's text, so an edited prompt is never answered from the cache. */
  hash: string;
}

export async function loadFeedbackPrompt(root: string): Promise<FeedbackPrompt> {
  const path = join(root, FEEDBACK_PROMPT_FILE);
  const template = await readFile(path, "utf8");
  if (!template.includes("{{script}}")) throw new Error(`${FEEDBACK_PROMPT_FILE} must contain {{script}} where the Urdu script is named`);
  return { version: basename(path, ".md"), template, hash: createHash("sha256").update(template).digest("hex") };
}

export interface FeedbackInput {
  script: ScriptChoice;
  task: string;
  transcript: string;
  audioSeconds: number;
}

/** The request for one answer. The LLM sees only text: the task, the transcript and the speaking speed. */
export function buildFeedbackRequest(prompt: FeedbackPrompt, input: FeedbackInput): LlmRequest {
  const words = input.transcript.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerMinute = Math.round(words / (input.audioSeconds / 60));
  return {
    system: prompt.template.replace("{{script}}", SCRIPT_TEXT[input.script]),
    messages: [
      {
        role: "user",
        content: [
          `Task: ${input.task}`,
          `Seconds spoken: ${Math.round(input.audioSeconds)}`,
          `Words per minute: ${wordsPerMinute}`,
          "Text of the answer:",
          input.transcript,
        ].join("\n"),
      },
    ],
    // Thinking models count their thinking against this limit, so it is generous. Only what is generated is billed.
    maxOutputTokens: 2000,
    responseFormat: "json",
  };
}

export interface Correction {
  kind: "mistake" | "polish";
  said: string;
  better: string;
  why: string;
}

export interface ScoreParts {
  taskFit: number;
  grammar: number;
  vocabulary: number;
  fluency: number;
}

export interface Feedback {
  scoreParts: ScoreParts;
  /** Sum of the four parts, worked out here and not trusted from the model (PRD 4.3: 40 + 25 + 20 + 15 = 100). */
  practiceScore: number;
  corrections: Correction[];
}

const feedbackSchema = z.object({
  score_parts: z.object({
    task_fit: z.number().int().min(0).max(40),
    grammar: z.number().int().min(0).max(25),
    vocabulary: z.number().int().min(0).max(20),
    fluency: z.number().int().min(0).max(15),
  }),
  corrections: z
    .array(
      z.object({
        kind: z.enum(["mistake", "polish"]),
        said: z.string().trim().min(1),
        better: z.string().trim().min(1),
        why: z.string().trim().min(1),
      }),
    )
    .length(3),
});

export type ParsedFeedback =
  | { ok: true; feedback: Feedback; /** true when the reply was not clean JSON and had to be cut out of fences or extra text */ recovered: boolean }
  | { ok: false; reason: string };

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Turns the model's reply into feedback, or says why it is not usable. Never throws. */
export function parseFeedback(reply: string): ParsedFeedback {
  let recovered = false;
  let raw = tryParse(reply.trim());
  if (raw === undefined) {
    const start = reply.indexOf("{");
    const end = reply.lastIndexOf("}");
    raw = start >= 0 && end > start ? tryParse(reply.slice(start, end + 1)) : undefined;
    recovered = true;
  }
  if (raw === undefined) return { ok: false, reason: "the reply was not valid JSON" };

  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.join(".") || "(root)" : "(root)";
    return { ok: false, reason: `the JSON has the wrong shape at "${where}": ${issue?.message ?? "unexpected value"}` };
  }
  const parts = parsed.data.score_parts;
  return {
    ok: true,
    recovered,
    feedback: {
      scoreParts: { taskFit: parts.task_fit, grammar: parts.grammar, vocabulary: parts.vocabulary, fluency: parts.fluency },
      practiceScore: parts.task_fit + parts.grammar + parts.vocabulary + parts.fluency,
      corrections: parsed.data.corrections,
    },
  };
}
