import { z } from "zod";
import { getConfig, type ConfigReader } from "@/lib/config";

export const LESSON_STATUSES = ["draft", "approved"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

/** The employer safeguard from Business Plan 11: lesson text is written from general public knowledge only. */
export const LESSON_SOURCE = "general_public_knowledge";

export type Script = "roman" | "urdu";

/** Urdu text. Roman Urdu is always there; Urdu script is added later (PRD 3: Roman Urdu default, Urdu script an option). */
export interface Localized {
  roman: string;
  urdu?: string;
}

export interface Phrase {
  /** "p1", "p2", ... */
  id: string;
  /** The English phrase the learner is taught. "..." stands for the part they fill in. */
  text: string;
  meaning: Localized;
  /** A sentence that uses the phrase. */
  example: string;
}

export interface Turn {
  /** "t1", "t2", ... */
  id: string;
  /** What the tutor (the interviewer) says. Played as audio and shown as text. */
  tutor_line: string;
  /** The instruction to the learner for this turn. Also the task the answer is scored against. */
  task: Localized;
  /** What a good answer sounds like. One example: many answers are good. */
  model_answer: string;
  /** The phrases (by id) the learner should try to use in this turn. */
  target_phrases: string[];
}

export interface Lesson {
  schema_version: 1;
  track: string;
  day: number;
  /** Starts at 1. Raise it when approved text changes: tutor audio is generated once per lesson version. */
  version: number;
  status: LessonStatus;
  source: typeof LESSON_SOURCE;
  title: Localized;
  /** One line in English: what the learner can do after this lesson. */
  goal: string;
  phrases: Phrase[];
  roleplay: Turn[];
  /** Questions for the founder. Must be empty before the lesson is approved. */
  review_notes: string[];
}

export interface LessonLimits {
  tracks: string[];
  trackDays: number;
  phrasesMin: number;
  phrasesMax: number;
  turnsMin: number;
  turnsMax: number;
  tutorLineMaxWords: number;
  modelAnswerMaxWords: number;
}

/** The lesson limits from config/app.json (rule 3). Throws a ConfigError naming the key if one is not set. */
export function lessonLimits(reader: ConfigReader = getConfig()): LessonLimits {
  return {
    tracks: reader.data.app.app.tracks,
    trackDays: reader.require("app", "lessons.track_days"),
    phrasesMin: reader.require("app", "lessons.phrases_min"),
    phrasesMax: reader.require("app", "lessons.phrases_max"),
    turnsMin: reader.require("app", "lessons.turns_min"),
    turnsMax: reader.require("app", "lessons.turns_max"),
    tutorLineMaxWords: reader.require("app", "lessons.tutor_line_max_words"),
    modelAnswerMaxWords: reader.require("app", "lessons.model_answer_max_words"),
  };
}

export const countWords = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

export interface SchemaOptions {
  /** Before launch: every Urdu line must also have an Urdu-script version. Off while lessons are Roman Urdu only. */
  requireUrdu: boolean;
}

/** The lesson file format. Counts and word limits come from config; the other rules are the PRD's structure. */
export function createLessonSchema(limits: LessonLimits, options: SchemaOptions = { requireUrdu: false }): z.ZodType<Lesson> {
  const text = z.string().trim().min(1, "must not be empty");
  const localized = z.strictObject({ roman: text, urdu: options.requireUrdu ? text : text.optional() });
  const words = (max: number) => (value: string) => countWords(value) <= max;

  const phrase = z.strictObject({
    id: z.string().regex(/^p\d+$/, 'must look like "p1"'),
    text,
    meaning: localized,
    example: text,
  });
  const turn = z.strictObject({
    id: z.string().regex(/^t\d+$/, 'must look like "t1"'),
    tutor_line: text.refine(words(limits.tutorLineMaxWords), `must be at most ${limits.tutorLineMaxWords} words`),
    task: localized,
    model_answer: text.refine(words(limits.modelAnswerMaxWords), `must be at most ${limits.modelAnswerMaxWords} words`),
    target_phrases: z.array(z.string()),
  });

  return z
    .strictObject({
      schema_version: z.literal(1),
      track: z.string().refine((track) => limits.tracks.includes(track), `must be one of: ${limits.tracks.join(", ")}`),
      day: z.number().int().min(1).max(limits.trackDays),
      version: z.number().int().min(1),
      status: z.enum(LESSON_STATUSES),
      source: z.literal(LESSON_SOURCE),
      title: localized,
      goal: text,
      phrases: z.array(phrase).min(limits.phrasesMin).max(limits.phrasesMax),
      roleplay: z.array(turn).min(limits.turnsMin).max(limits.turnsMax),
      review_notes: z.array(text),
    })
    .superRefine((lesson, ctx) => {
      const phraseIds = new Set<string>();
      lesson.phrases.forEach((p, i) => {
        if (phraseIds.has(p.id)) ctx.addIssue({ code: "custom", path: ["phrases", i, "id"], message: `"${p.id}" is used twice` });
        phraseIds.add(p.id);
      });

      const turnIds = new Set<string>();
      const practised = new Set<string>();
      lesson.roleplay.forEach((t, i) => {
        if (turnIds.has(t.id)) ctx.addIssue({ code: "custom", path: ["roleplay", i, "id"], message: `"${t.id}" is used twice` });
        turnIds.add(t.id);
        const seen = new Set<string>();
        t.target_phrases.forEach((id, j) => {
          if (!phraseIds.has(id)) ctx.addIssue({ code: "custom", path: ["roleplay", i, "target_phrases", j], message: `"${id}" is not a phrase in this lesson` });
          if (seen.has(id)) ctx.addIssue({ code: "custom", path: ["roleplay", i, "target_phrases", j], message: `"${id}" is listed twice in this turn` });
          seen.add(id);
          practised.add(id);
        });
      });
      lesson.phrases.forEach((p, i) => {
        if (!practised.has(p.id)) ctx.addIssue({ code: "custom", path: ["phrases", i], message: `"${p.id}" is taught but no roleplay turn lists it in target_phrases` });
      });

      if (lesson.status === "approved" && lesson.review_notes.length > 0) {
        ctx.addIssue({ code: "custom", path: ["review_notes"], message: "must be empty before a lesson is approved: answer each note, then remove it" });
      }
    });
}
