// Helpers for the voice-test tests only: tiny valid WAV files and temporary folders. No real audio, no network.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repo root, where prompts/ lives. */
export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** A silent 8 kHz, 16-bit mono WAV that lasts exactly `seconds` seconds. */
export function makeWav(seconds: number): Uint8Array {
  const sampleRate = 8000;
  const dataBytes = Math.round(seconds * sampleRate) * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

const created: string[] = [];

export async function tempDir(prefix = "bolo-voice-test-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Call from afterEach. */
export async function removeTempDirs(): Promise<void> {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

export interface RecordingFixture {
  dir: string;
}

/** A recordings folder with the given WAV files (name -> seconds) and the two CSV files. */
export async function makeRecordingsDir(files: Record<string, number>, consentCsv: string, referenceCsv: string): Promise<string> {
  const dir = await tempDir();
  await mkdir(dir, { recursive: true });
  for (const [name, seconds] of Object.entries(files)) await writeFile(join(dir, name), makeWav(seconds));
  await writeFile(join(dir, "consent.csv"), consentCsv);
  await writeFile(join(dir, "reference.csv"), referenceCsv);
  return dir;
}
