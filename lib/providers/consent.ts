import { ConfigError } from "@/lib/config/errors";

/**
 * Rule: never send audio to an AI provider before the consent version is stored.
 * Callers pass the stored consent version; an empty one stops the call before any provider runs.
 */
export function assertConsent(consentVersion: string | null | undefined): asserts consentVersion is string {
  if (typeof consentVersion !== "string" || consentVersion.trim() === "") {
    throw new ConfigError(
      "invalid",
      "app",
      "consent.version",
      "no consent version is stored for this user, so audio must not be sent to an AI provider",
    );
  }
}
