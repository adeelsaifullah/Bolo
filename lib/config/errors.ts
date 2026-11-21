export type ConfigSource = "plans" | "app" | "strings" | "env";
export type ConfigErrorReason = "missing" | "null" | "invalid";

/**
 * Thrown when a feature asks for a config value that is missing, null, or invalid.
 * The message names the file and the key so the fix is obvious.
 */
export class ConfigError extends Error {
  readonly reason: ConfigErrorReason;
  readonly source: ConfigSource;
  readonly path: string;

  constructor(reason: ConfigErrorReason, source: ConfigSource, path: string, detail?: string) {
    super(ConfigError.describe(reason, source, path, detail));
    this.name = "ConfigError";
    this.reason = reason;
    this.source = source;
    this.path = path;
  }

  private static describe(
    reason: ConfigErrorReason,
    source: ConfigSource,
    path: string,
    detail?: string,
  ): string {
    if (source === "env") {
      const base =
        reason === "missing"
          ? `Environment variable ${path} is missing or empty. Set it in .env.local (see .env.example).`
          : `Environment variable ${path} is invalid.`;
      return detail ? `${base} ${detail}` : base;
    }
    const file = `config/${source}.json`;
    switch (reason) {
      case "missing":
        return `Config value "${path}" is missing from ${file}.`;
      case "null":
        return `Config value "${path}" is null in ${file}. It has not been decided yet: set a real value in ${file} before using this feature.`;
      case "invalid":
        return `${file} is invalid at "${path}": ${detail ?? "unexpected value"}`;
    }
  }
}
