const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/flac": "flac",
};

/** File extension for an audio MIME type, for providers that sniff the upload's file name. Throws for unknown types. */
export function extensionForMime(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = EXTENSIONS[base];
  if (!extension) throw new RangeError(`unsupported audio type "${mimeType}"`);
  return extension;
}
