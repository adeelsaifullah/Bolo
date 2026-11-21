import type { CostedResult } from "@/lib/providers/types";

export interface TtsRequest {
  text: string;
  /** BCP-47 language of the text, e.g. "en". */
  language: string;
  /** Provider-specific voice id. Optional: the provider picks its default. */
  voice?: string;
}

export interface TtsResult extends CostedResult {
  audio: Uint8Array;
  mimeType: string;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(request: TtsRequest): Promise<TtsResult>;
}
