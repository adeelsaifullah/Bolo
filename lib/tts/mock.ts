import type { TtsProvider } from "./types";

/** A valid WAV file of silence (8 kHz, 16-bit mono). */
function silentWav(seconds: number): Uint8Array {
  const sampleRate = 8000;
  const dataBytes = Math.round(seconds * sampleRate) * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  return out;
}

/** Deterministic fake text-to-speech: returns silence. Makes no network call. */
export const mockTts: TtsProvider = {
  name: "mock",
  async synthesize() {
    return { provider: "mock", costUsd: 0, audio: silentWav(0.25), mimeType: "audio/wav" };
  },
};
