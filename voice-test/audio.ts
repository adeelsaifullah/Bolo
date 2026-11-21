import { extname } from "node:path";
import { parseBuffer } from "music-metadata";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg", // WhatsApp voice notes: Opus audio in an Ogg file
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
};

// Audio files the speech-to-text providers here do not accept. Listed so they are reported, not silently skipped.
const UNSUPPORTED_EXTENSIONS = new Set([".amr", ".3gp", ".aac", ".wma", ".mka", ".mpga", ".mpeg", ".caf"]);

export type AudioKind = { kind: "supported"; mimeType: string } | { kind: "unsupported" } | { kind: "not-audio" };

/** Decides from the file name whether a file in the recordings folder is audio the test can send. */
export function classifyFile(fileName: string): AudioKind {
  const extension = extname(fileName).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (mimeType) return { kind: "supported", mimeType };
  if (UNSUPPORTED_EXTENSIONS.has(extension)) return { kind: "unsupported" };
  return { kind: "not-audio" };
}

/**
 * Length of an audio file in seconds, measured locally so cost does not depend on what a provider reports.
 * Browser-recorded WebM often has no length in its header, so the file is scanned when needed.
 */
export async function audioDurationSeconds(audio: Uint8Array, mimeType: string): Promise<number> {
  const { format } = await parseBuffer(audio, { mimeType }, { duration: true });
  const seconds = format.duration;
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("could not read the length of this audio file");
  }
  return seconds;
}
