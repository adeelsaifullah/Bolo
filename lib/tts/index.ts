import { selectProvider } from "@/lib/providers/select";
import { mockTts } from "./mock";
import type { TtsProvider } from "./types";

export type { TtsProvider, TtsRequest, TtsResult } from "./types";

const registry: Record<string, () => TtsProvider> = { mock: () => mockTts };

/** Chosen by TTS_PROVIDER. */
export function getTtsProvider(env?: Record<string, string | undefined>): TtsProvider {
  return selectProvider({ envName: "TTS_PROVIDER", defaultName: "mock", registry, env });
}
