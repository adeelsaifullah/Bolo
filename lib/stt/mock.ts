import type { SttProvider } from "./types";

/** Deterministic fake speech-to-text for local work and tests. Makes no network call. */
export const mockStt: SttProvider = {
  name: "mock",
  async transcribe(request) {
    return {
      provider: "mock",
      costUsd: 0,
      transcript: "mock transcript",
      // Pretend 16 kHz, 16-bit mono PCM so the number is stable and plausible.
      audioSeconds: request.audio.byteLength / 32000,
    };
  },
};
