import { assertConsent } from "@/lib/providers/consent";
import { selectProvider } from "@/lib/providers/select";
import { deepgramSttFromEnv } from "./deepgram";
import { mockStt } from "./mock";
import { openAiSttFromEnv } from "./openai";
import type { SttProvider } from "./types";

export type { SttProvider, SttRequest, SttResult } from "./types";

// Real providers read their own key from the environment only when they are chosen.
const registry: Record<string, () => SttProvider> = {
  mock: () => mockStt,
  deepgram: () => deepgramSttFromEnv(),
  openai: () => openAiSttFromEnv(),
};

/** Wraps a provider so the consent check runs first and the provider never sees audio without it. */
export function withConsentGuard(inner: SttProvider): SttProvider {
  return {
    name: inner.name,
    model: inner.model,
    pricing: inner.pricing,
    transcribe(request) {
      assertConsent(request.consentVersion);
      return inner.transcribe(request);
    },
  };
}

/** Chosen by STT_PROVIDER. Always consent-guarded. */
export function getSttProvider(env?: Record<string, string | undefined>): SttProvider {
  return withConsentGuard(selectProvider({ envName: "STT_PROVIDER", defaultName: "mock", registry, env }));
}
