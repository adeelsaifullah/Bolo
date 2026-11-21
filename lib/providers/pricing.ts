import { ConfigError } from "@/lib/config/errors";

/**
 * Reads a vendor unit price (USD) from the environment, or returns the built-in default.
 * Vendor prices change and are tagged [VERIFY] in the PRD, so the default can be overridden without a code change:
 * set the variable to what the provider's dashboard actually bills.
 */
export function readPrice(name: string, fallback: number, env: Record<string, string | undefined> = process.env): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigError("invalid", "env", name, `expected a positive number of US dollars such as ${fallback}, got "${raw}".`);
  }
  return value;
}

/** Cost of audio billed per minute. */
export function audioCostUsd(audioSeconds: number, usdPerMinute: number): number {
  return (audioSeconds / 60) * usdPerMinute;
}

/** Cost of an LLM call billed per million tokens. */
export function tokenCostUsd(inputTokens: number, outputTokens: number, usdPerMillionInput: number, usdPerMillionOutput: number): number {
  return (inputTokens * usdPerMillionInput + outputTokens * usdPerMillionOutput) / 1_000_000;
}
