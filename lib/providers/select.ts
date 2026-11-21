import { ConfigError } from "@/lib/config/errors";

export type ProviderKind = "stt" | "llm" | "tts" | "payments";

export interface SelectOptions<T> {
  /** Env var that names the provider, e.g. STT_PROVIDER. */
  envName: string;
  /** Name used when the env var is unset (outside production). */
  defaultName: string;
  /** Registered implementations by name. Real providers are added here later. */
  registry: Record<string, () => T>;
  /** Injectable for tests. */
  env?: Record<string, string | undefined>;
}

/**
 * Picks a provider implementation by env name (rule 8: providers swap by config).
 * In production the env var must be set explicitly, so a deployment can never silently run on a mock.
 */
export function selectProvider<T>({ envName, defaultName, registry, env = process.env }: SelectOptions<T>): T {
  const raw = env[envName]?.trim();
  if (!raw && env.NODE_ENV === "production") {
    throw new ConfigError("missing", "env", envName, `Set it to one of: ${Object.keys(registry).join(", ")}.`);
  }
  const name = raw || defaultName;
  const factory = registry[name];
  if (!factory) {
    throw new ConfigError(
      "invalid",
      "env",
      envName,
      `"${name}" is not a registered provider. Choose one of: ${Object.keys(registry).join(", ")}.`,
    );
  }
  return factory();
}
