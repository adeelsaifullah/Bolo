import { z } from "zod";
import { SCRIPT_TEXT } from "@/content/pilot";
import { loadPrompt } from "@/content/prompts";
import type { LlmRequest } from "@/lib/llm";

export type ScriptChoice = "roman" | "urdu";

export interface FeedbackPrompt {
  /** For example "tutor-feedback.v1". Saved with every result, and part of the results folder's name. */
  version: string;
  template: string;
  /** Fingerprint of the file's text, so an edited prompt is never answered from the cache. */
  hash: string;
}

/** The tutor prompt the app will ship (prompts/tutor-feedback.md), so the voice test measures what users will really get. */
export async function loadFeedbackPrompt(root: string): Promise<FeedbackPrompt> {
  const prompt = await loadPrompt(root, "tutor-feedback");
  if (!prompt.template.includes("{{script}}")) throw new Error("prompts/tutor-feedback.md must contain {{script}} where the Urdu script is named");
  return { version: prompt.label, template: prompt.template, hash: prompt.hash };
}

export interface FeedbackInput {
  script: ScriptChoice;
  /** What the speaker was asked, if reference.csv says. Empty when it does not. */
  question: string;
  transcript: string;
  audioSeconds: number;
}

/**
 * The request for one answer, in the message format prompts/tutor-feedback.md describes.
 * A recording has no lesson behind it, so the lesson lines say so. The LLM sees only text.
 */
export function buildFeedbackRequest(prompt: FeedbackPrompt, input: FeedbackInput): LlmRequest {
  const words = input.transcript.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerMinute = Math.round(words / (input.audioSeconds / 60));
  return {
    system: prompt.template.replaceAll("{{script}}", SCRIPT_TEXT[input.script]),
    messages: [
      {
        role: "user",
        content: [
          "Lesson goal: General interview practice. This recording is not from a lesson.",
          `Interviewer said: ${input.question || "(the question was not recorded)"}`,
          "Learner's task: Answer the interviewer's question in English.",
          "Example answer: none",
          "Phrases from today's lesson: none",
          `Seconds spoken: ${Math.round(input.audioSeconds)}`,
          `Words per minute: ${wordsPerMinute}`,
          `Answer: ${input.transcript}`,
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
