import type { CostedResult } from "@/lib/providers/types";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxOutputTokens: number;
  /** "json" asks the provider for a JSON-only reply. The prompt itself must also say JSON. Default "text". */
  responseFormat?: "text" | "json";
}

export interface LlmResult extends CostedResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  readonly name: string;
  /** The model id in use. Shown in reports. */
  readonly model?: string;
  /** The unit prices in use. Lets the voice test re-price saved results. */
  readonly pricing?: { usdPerMillionInput: number; usdPerMillionOutput: number };
  complete(request: LlmRequest): Promise<LlmResult>;
}
