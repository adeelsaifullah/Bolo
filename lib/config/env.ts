import { ConfigError } from "./errors";

/**
 * Reads a required environment variable. Empty and whitespace-only values count as missing.
 *
 * NEXT_PUBLIC_* variables are inlined by Next.js only when written literally, so for those
 * pass the value in: requireEnv("NEXT_PUBLIC_X", process.env.NEXT_PUBLIC_X).
 */
export function requireEnv(name: string, value: string | undefined = process.env[name]): string {
  if (value === undefined || value.trim() === "") {
    throw new ConfigError("missing", "env", name);
  }
  return value.trim();
}

/** Reads an optional environment variable; empty means unset. */
export function optionalEnv(name: string, value: string | undefined = process.env[name]): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim();
}
