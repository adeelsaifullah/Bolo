import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SHARED_START = "<!-- shared:start -->";
const SHARED_END = "<!-- shared:end -->";

export interface Prompt {
  /** The file name without .md, for example "tutor-feedback". */
  id: string;
  /** Whole number. Raise it whenever the text changes: the app saves it on every attempt. */
  version: number;
  /** For example "tutor-feedback.v1". This is the "prompt version" stored with each result. */
  label: string;
  /** SHA-256 of the whole file. A saved result made with different text is never reused. */
  hash: string;
  /** The prompt text with the front matter and the shared markers removed. May still contain {{placeholders}}. */
  template: string;
  /** The block between the shared markers: rules that other prompts reuse, so there is one copy of them. */
  shared: string | null;
}

/** Reads a prompt file: a front matter block (id, version) followed by the text. */
export function parsePrompt(raw: string, expectedId?: string): Prompt {
  const text = raw.replace(/\r\n/g, "\n");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!front) throw new Error("the prompt file must start with a --- block giving id and version");

  const fields: Record<string, string> = {};
  for (const line of front[1]!.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  const id = fields.id ?? "";
  const version = Number(fields.version);
  if (!id) throw new Error("the prompt's front matter has no id");
  if (expectedId !== undefined && id !== expectedId) throw new Error(`the prompt's id is "${id}" but the file is ${expectedId}.md`);
  if (!Number.isInteger(version) || version < 1) throw new Error("the prompt's version must be a whole number of 1 or more");

  const body = text.slice(front[0].length).trim();
  const start = body.indexOf(SHARED_START);
  const end = body.indexOf(SHARED_END);
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start) || body.split(SHARED_START).length > 2) {
    throw new Error(`the shared block needs exactly one ${SHARED_START} followed by one ${SHARED_END}`);
  }
  const shared = start === -1 ? null : body.slice(start + SHARED_START.length, end).trim();
  const template = body.replace(new RegExp(`^(?:${SHARED_START}|${SHARED_END})\\n?`, "gm"), "").trim();

  return { id, version, label: `${id}.v${version}`, hash: createHash("sha256").update(text).digest("hex"), template, shared };
}

/** Loads prompts/<id>.md. */
export async function loadPrompt(root: string, id: string): Promise<Prompt> {
  return parsePrompt(await readFile(join(root, "prompts", `${id}.md`), "utf8"), id);
}

/** Replaces every {{name}}. A placeholder with no value is an error, so a typo never reaches a model. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`no value was given for {{${name}}}`);
    return value;
  });
}
