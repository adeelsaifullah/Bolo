import type { CostedResult } from "@/lib/providers/types";

export interface SttRequest {
  audio: Uint8Array;
  mimeType: string;
  /** BCP-47 language the user is expected to speak, e.g. "en". */
  language: string;
  /** Stored consent version. Required: audio is never sent without it. */
  consentVersion: string;
  /** Length of the audio in seconds, measured by the caller. Used for cost when the provider does not report a length. */
  audioSeconds?: number;
}

export interface SttResult extends CostedResult {
  transcript: string;
  audioSeconds: number;
}

export interface SttProvider {
  readonly name: string;
  /** The model id in use, when the provider offers several. Shown in reports. */
  readonly model?: string;
  /** The unit price in use, when the provider bills by audio length. Lets the voice test re-price saved results. */
  readonly pricing?: { usdPerAudioMinute: number };
  transcribe(request: SttRequest): Promise<SttResult>;
}
