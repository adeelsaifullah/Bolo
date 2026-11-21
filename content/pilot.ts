import { fillTemplate, type Prompt } from "./prompts";
import type { Lesson, Localized, Script } from "./schema";

/** How the Urdu is named inside a prompt, where it replaces {{script}}. */
export const SCRIPT_TEXT: Record<Script, string> = {
  roman: "Roman Urdu (Urdu written in English letters), with common everyday spellings, the way people type on WhatsApp",
  urdu: "Urdu script (اردو)",
};

/** The short name, for the flow text of the pilot prompt, where it replaces {{script_name}}. */
export const SCRIPT_NAME: Record<Script, string> = { roman: "Roman Urdu", urdu: "Urdu script" };

const pick = (text: Localized, script: Script): string => (script === "urdu" ? (text.urdu ?? text.roman) : text.roman);
const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

export const pilotFileName = (lesson: Lesson): string => `${lesson.track}-day-${String(lesson.day).padStart(2, "0")}.md`;

/** A lesson as plain text a person (or a model in a chat) can read: the pilot prompt's {{lesson}}. */
export function renderLesson(lesson: Lesson, script: Script = "roman"): string {
  const byId = new Map(lesson.phrases.map((p) => [p.id, p.text]));
  const lines: string[] = [
    `Lesson: ${titleCase(lesson.track)} track, Day ${lesson.day} (lesson version ${lesson.version}, ${lesson.status})`,
    `Title: ${pick(lesson.title, script)}`,
    `Goal: ${lesson.goal}`,
    "",
    `Phrases to teach (${lesson.phrases.length}):`,
  ];
  lesson.phrases.forEach((p, i) => {
    lines.push(`${i + 1}. "${p.text}"`, `   Meaning: ${pick(p.meaning, script)}`, `   Example: "${p.example}"`);
  });
  lines.push("", `Roleplay: you are the interviewer (${lesson.roleplay.length} turns):`);
  lesson.roleplay.forEach((t, i) => {
    lines.push(
      `Turn ${i + 1}`,
      `  You say: "${t.tutor_line}"`,
      `  Learner's task: ${pick(t.task, script)}`,
      `  Example answer: "${t.model_answer}"`,
      `  Phrases from today's lesson: ${t.target_phrases.length > 0 ? t.target_phrases.map((id) => `"${byId.get(id) ?? id}"`).join(", ") : "none"}`,
    );
  });
  return lines.join("\n");
}

export interface PilotInputs {
  lesson: Lesson;
  script?: Script;
  /** prompts/tutor-pilot.md */
  pilot: Prompt;
  /** prompts/tutor-feedback.md: its shared block supplies the rubric and the rules. */
  feedback: Prompt;
}

/**
 * The file the founder pastes into a new Claude chat to run one day's lesson over WhatsApp.
 * Everything above the line is a note for the founder; everything below it is pasted.
 */
export function buildPilotPack({ lesson, script = "roman", pilot, feedback }: PilotInputs): string {
  if (feedback.shared === null) throw new Error(`${feedback.label} has no shared block to put into the pilot prompt`);
  // The shared rules contain {{script}} too, so they go in first and the rest is filled afterwards.
  const withRules = pilot.template.replace("{{shared_rules}}", () => feedback.shared!);
  const prompt = fillTemplate(withRules, { script: SCRIPT_TEXT[script], script_name: SCRIPT_NAME[script], lesson: renderLesson(lesson, script) });

  return [
    "FOR THE FOUNDER (do not paste this part)",
    `Lesson: ${lesson.track} Day ${lesson.day}, lesson version ${lesson.version}, status ${lesson.status}.`,
    `Prompt versions: ${pilot.label}, and the rubric and rules from ${feedback.label}.`,
    "To run it: open a new Claude chat and paste everything below the line. Claude's first reply is the opening message for the learner. Copy each reply to WhatsApp, and paste each learner answer back (typed, or a voice note you have turned into text).",
    "To talk to Claude yourself instead of the learner, start your message with FOUNDER:",
    `This file is generated. To change it, edit content/${lesson.track}/day-${String(lesson.day).padStart(2, "0")}.json or the prompts, then run: npm run content:pilot`,
    "",
    "======== PASTE FROM THE NEXT LINE DOWN ========",
    prompt,
    "",
  ].join("\n");
}
