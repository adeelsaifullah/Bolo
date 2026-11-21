import type { CostedResult } from "@/lib/providers/types";

export interface SttRequest {
  audio: Uint8Array;
  mimeType: string;
  /** BCP-47 language the user is expected to speak, e.g. "en". */
  language: string;
  /** Stored consent version. Required: audio is never sent without it. */
  consentVersion: string;
}

export interface SttResult extends CostedResult {
  transcript: string;
  audioSeconds: number;
}

export interface SttProvider {
  readonly name: string;
  transcribe(request: SttRequest): Promise<SttResult>;
}
