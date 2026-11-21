import type { z } from "zod";
import appJson from "@/config/app.json";
import plansJson from "@/config/plans.json";
import stringsJson from "@/config/strings.json";
import { ConfigError, type ConfigSource } from "./errors";
import {
  appSchema,
  LOCALES,
  plansSchema,
  stringsSchema,
  type AppConfig,
  type Plans,
  type Strings,
} from "./schema";

export { ConfigError } from "./errors";
export { optionalEnv, requireEnv } from "./env";
export type { AppConfig, Locale, Plans, Strings } from "./schema";
export { LOCALES } from "./schema";

export interface ConfigData {
  plans: Plans;
  app: AppConfig;
  strings: Strings;
}

type JsonConfigFile = "plans" | "app";

// ---- typed dotted paths, e.g. "plans.sprint_14.price_pkr" ----
type Leaf = string | number | boolean | null | undefined | readonly unknown[];
export type Path<T> = T extends Leaf
  ? never
  : { [K in keyof T & string]: T[K] extends Leaf ? K : K | `${K}.${Path<T[K]>}` }[keyof T & string];
type PathValue<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? PathValue<NonNullable<T[Head]>, Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

function validate<S extends z.ZodType>(source: ConfigSource, schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const [issue, ...rest] = result.error.issues;
  const path = issue ? issue.path.map(String).join(".") || "(root)" : "(root)";
  const more = rest.length > 0 ? ` (+${rest.length} more problem${rest.length > 1 ? "s" : ""})` : "";
  throw new ConfigError("invalid", source, path, `${issue?.message ?? "unexpected value"}${more}`);
}

/** Validates raw JSON for the three config files. Throws ConfigError on the first bad file. */
export function parseConfig(raw: { plans: unknown; app: unknown; strings: unknown }): ConfigData {
  const plans = validate("plans", plansSchema, raw.plans);
  const app = validate("app", appSchema, raw.app);
  const strings = validate("strings", stringsSchema, raw.strings);

  const def = app.app.default_locale;
  if (!(def in strings)) {
    throw new ConfigError("invalid", "app", "app.default_locale", `no strings for locale "${def}" in config/strings.json`);
  }
  for (const loc of LOCALES) {
    if (!(loc in app.locales)) {
      throw new ConfigError("invalid", "app", `locales.${loc}`, "locale is not listed");
    }
  }
  return { plans, app, strings };
}

export interface ConfigReader {
  readonly data: ConfigData;
  /**
   * Returns a value that must be set. Throws ConfigError if the key is missing or the value is null.
   * Example: reader.require("app", "limits.day_cap_minutes")
   */
  require<F extends JsonConfigFile, P extends Path<ConfigData[F]>>(
    file: F,
    path: P,
  ): NonNullable<PathValue<ConfigData[F], P>>;
}

export function createConfigReader(data: ConfigData): ConfigReader {
  return {
    data,
    require(file, path) {
      let current: unknown = data[file];
      for (const segment of String(path).split(".")) {
        if (current === null || typeof current !== "object" || !(segment in current)) {
          throw new ConfigError("missing", file, String(path));
        }
        current = (current as Record<string, unknown>)[segment];
      }
      if (current === undefined) throw new ConfigError("missing", file, String(path));
      if (current === null) throw new ConfigError("null", file, String(path));
      return current as never;
    },
  };
}

let cached: ConfigReader | undefined;

/** The validated config shipped in /config. Parsed once, then cached. */
export function getConfig(): ConfigReader {
  cached ??= createConfigReader(parseConfig({ plans: plansJson, app: appJson, strings: stringsJson }));
  return cached;
}

/** Shortcut for getConfig().require(file, path). */
export function requireConfig<F extends JsonConfigFile, P extends Path<ConfigData[F]>>(
  file: F,
  path: P,
): NonNullable<PathValue<ConfigData[F], P>> {
  return getConfig().require(file, path);
}
