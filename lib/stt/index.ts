import { assertConsent } from "@/lib/providers/consent";
import { selectProvider } from "@/lib/providers/select";
import { mockStt } from "./mock";
import type { SttProvider } from "./types";

export type { SttProvider, SttRequest, SttResult } from "./types";

const registry: Record<string, () => SttProvider> = { mock: () => mockStt };

/** Wraps a provider so the consent check runs first and the provider never sees audio without it. */
export function withConsentGuard(inner: SttProvider): SttProvider {
  return {
    name: inner.name,
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
