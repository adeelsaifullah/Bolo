import type stringsJson from "@/config/strings.json";
import { ConfigError, getConfig, LOCALES, type ConfigData, type Locale } from "@/lib/config";
import type { StringTree } from "@/lib/config/schema";

export type { Locale } from "@/lib/config";

type Join<K extends string, P extends string> = `${K}.${P}`;
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string | null ? K : T[K] extends object ? Join<K, LeafPaths<T[K]>> : never;
}[keyof T & string];

/** Every key in the default locale, e.g. "app.name". A typo fails the typecheck. */
export type StringKey = LeafPaths<(typeof stringsJson)["ur-Latn"]>;

export interface TranslateOptions {
  /** Values for {placeholders} in the text. */
  params?: Record<string, string | number>;
  /** Locale override. Defaults to app.default_locale in config/app.json. */
  locale?: Locale;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function defaultLocale(): Locale {
  return getConfig().data.app.app.default_locale;
}

export function localeDirection(locale: Locale = defaultLocale()): "ltr" | "rtl" {
  return getConfig().data.app.locales[locale].dir;
}

function lookup(tree: StringTree, key: string): string | null | undefined {
  let current: string | null | StringTree | undefined = tree;
  for (const segment of key.split(".")) {
    if (current === null || current === undefined || typeof current === "string") return undefined;
    current = current[segment];
  }
  if (current !== null && typeof current === "object") return undefined; // a branch, not a text
  return current;
}

function fill(text: string, params: Record<string, string | number> | undefined, key: string): string {
  return text.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined) {
      throw new ConfigError("invalid", "strings", key, `placeholder {${name}} was not given a value`);
    }
    return String(value);
  });
}

/**
 * Builds a translator over a validated config. The app uses the shared `t` below; tests pass their own data.
 */
export function createT(data: ConfigData) {
  const fallbackLocale = data.app.app.default_locale;
  return function translate(key: StringKey, options: TranslateOptions = {}): string {
    const locale = options.locale ?? fallbackLocale;

    const primary = lookup(data.strings[locale], key);
    if (typeof primary === "string") return fill(primary, options.params, key);

    const fallback = lookup(data.strings[fallbackLocale], key);
    if (typeof fallback === "string") return fill(fallback, options.params, key);

    throw new ConfigError(fallback === null ? "null" : "missing", "strings", `${fallbackLocale}.${key}`);
  };
}

/**
 * Looks up user-facing text in config/strings.json. No text lives in components.
 *
 * - The default locale (ur-Latn, Roman Urdu) is the source of truth: a missing or null key throws.
 * - Another locale (ur, Urdu script) falls back to the default locale text while a translation is
 *   missing or null, so a half-translated file never breaks a screen.
 */
export function t(key: StringKey, options?: TranslateOptions): string {
  return createT(getConfig().data)(key, options);
}
