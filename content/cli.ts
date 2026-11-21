// npm run content:check   checks every lesson file and the copy rules
// npm run content:pilot   writes content/pilot/<track>-day-NN.md, one pasteable pack per lesson
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { requireConfig } from "@/lib/config";
import { buildPilotPack, pilotFileName } from "./pilot";
import { loadPrompt } from "./prompts";
import { lessonLimits } from "./schema";
import { loadLessons, missingDays, type LoadedLessons } from "./validate";

const out = (line = ""): void => void process.stdout.write(`${line}\n`);

const range = (days: number[]): string => days.map(String).join(", ");

/** Prints the check report. Returns the number of errors (lesson errors, copy-rule errors and folder problems). */
export function reportLessons(loaded: LoadedLessons, launchDays: number, tracks: string[]): number {
  let errors = loaded.problems.length;
  for (const problem of loaded.problems) out(`PROBLEM ${problem}`);

  for (const entry of loaded.lessons) {
    const ruleErrors = entry.findings.filter((f) => f.severity === "error");
    const review = entry.findings.filter((f) => f.severity === "review");
    errors += entry.issues.length + ruleErrors.length;
    const lesson = entry.lesson;
    const state = entry.issues.length + ruleErrors.length === 0 ? "OK   " : "ERROR";
    const facts = lesson
      ? `${lesson.status.padEnd(8)} v${lesson.version}  ${lesson.phrases.length} phrases  ${lesson.roleplay.length} turns  ${lesson.review_notes.length} note(s)`
      : "";
    out(`${state} ${entry.file.padEnd(24)} ${facts}${review.length > 0 ? `  ${review.length} to read` : ""}`);
    for (const issue of entry.issues) out(`       ${issue.path}: ${issue.message}`);
    for (const f of ruleErrors) out(`       ${f.path}: "${f.match}" breaks a copy rule (${f.why})`);
    for (const [rule, hits] of Object.entries(Object.groupBy(review, (f) => f.rule))) {
      const first = hits![0]!;
      out(`       read the sentence${hits!.length > 1 ? `s (${hits!.length}, first at ${first.path})` : ` at ${first.path}`}: "${first.match}" (${first.why}) [${rule}]`);
    }
  }

  const valid = loaded.lessons.filter((l) => l.lesson !== null).length;
  out();
  out(`Checked ${loaded.lessons.length} lesson file(s): ${valid} valid, ${loaded.lessons.length - valid} with errors.`);
  for (const track of tracks) {
    if (!loaded.lessons.some((l) => l.file.startsWith(`${track}/`))) continue;
    const missing = missingDays(loaded.lessons, track, launchDays);
    out(missing.length === 0 ? `${track}: Days 1-${launchDays} are all there.` : `${track}: missing Days ${range(missing)} of the first ${launchDays}.`);
  }
  return errors;
}

async function main(): Promise<void> {
  const [command, ...flags] = process.argv.slice(2);
  const root = process.cwd();
  const limits = lessonLimits();
  const launchDays = requireConfig("app", "lessons.launch_days_per_track");
  const loaded = await loadLessons(join(root, "content"), limits, { requireUrdu: flags.includes("--require-urdu") });

  if (command === "check") {
    const errors = reportLessons(loaded, launchDays, limits.tracks);
    out(errors === 0 ? "No errors." : `${errors} error(s): fix them and run this again.`);
    process.exitCode = errors === 0 ? 0 : 1;
    return;
  }

  if (command === "pilot") {
    const errors = reportLessons(loaded, launchDays, limits.tracks);
    if (errors > 0) {
      out(`${errors} error(s): no pilot packs were written. Fix them and run this again.`);
      process.exitCode = 1;
      return;
    }
    const pilot = await loadPrompt(root, "tutor-pilot");
    const feedback = await loadPrompt(root, "tutor-feedback");
    await mkdir(join(root, "content", "pilot"), { recursive: true });
    let written = 0;
    for (const { lesson } of loaded.lessons) {
      if (!lesson) continue;
      const path = join(root, "content", "pilot", pilotFileName(lesson));
      const text = buildPilotPack({ lesson, pilot, feedback });
      const old = await readFile(path, "utf8").catch(() => null);
      if (old !== text) {
        await writeFile(path, text);
        written += 1;
      }
    }
    out(`Pilot packs: ${written} written or updated, ${loaded.lessons.length - written} already up to date (content/pilot/).`);
    return;
  }

  out("Usage: npm run content:check [-- --require-urdu]   or   npm run content:pilot");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Unexpected error"}\n`);
  process.exitCode = 1;
});
