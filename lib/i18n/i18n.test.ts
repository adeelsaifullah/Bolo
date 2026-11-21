import { describe, expect, it } from "vitest";
import appJson from "@/config/app.json";
import plansJson from "@/config/plans.json";
import stringsJson from "@/config/strings.json";
import { ConfigError, parseConfig, type ConfigData } from "@/lib/config";
import { createT, defaultLocale, isLocale, localeDirection, t, type StringKey } from "./index";

function dataWith(strings: unknown): ConfigData {
  return parseConfig({ plans: structuredClone(plansJson), app: structuredClone(appJson), strings });
}

function leafKeys(tree: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    value !== null && typeof value === "object"
      ? leafKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("t() with the shipped strings", () => {
  it("defaults to Roman Urdu (ur-Latn)", () => {
    expect(defaultLocale()).toBe("ur-Latn");
    expect(t("common.retry")).toBe("Dobara koshish karein");
  });

  it("returns Urdu script when asked", () => {
    expect(t("common.retry", { locale: "ur" })).toBe("دوبارہ کوشش کریں");
  });

  it("knows the text direction of each locale", () => {
    expect(localeDirection("ur-Latn")).toBe("ltr");
    expect(localeDirection("ur")).toBe("rtl");
    expect(localeDirection()).toBe("ltr");
  });

  it("recognises locale names", () => {
    expect(isLocale("ur")).toBe(true);
    expect(isLocale("en")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("every Urdu-script key also exists in Roman Urdu (catches typos)", () => {
    const roman = new Set(leafKeys(stringsJson["ur-Latn"]));
    const stray = leafKeys(stringsJson.ur).filter((key) => !roman.has(key));
    expect(stray).toEqual([]);
  });

  it("every Roman Urdu text is filled in", () => {
    const tree = stringsJson["ur-Latn"] as Record<string, unknown>;
    const empty = leafKeys(tree).filter((key) => {
      const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], tree);
      return typeof value !== "string" || value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});

describe("createT()", () => {
  const strings = {
    "ur-Latn": {
      app: { name: "Bolo" },
      lesson: { left: "{minutes} minute baqi", pending: null, both: "{a} aur {b}" },
    },
    ur: { lesson: { left: "{minutes} منٹ باقی", pending: "زیر التوا" } },
  };
  const tt = createT(dataWith(strings));
  const key = (k: string) => k as StringKey;

  it("fills placeholders", () => {
    expect(tt(key("lesson.left"), { params: { minutes: 5 } })).toBe("5 minute baqi");
    expect(tt(key("lesson.both"), { params: { a: "x", b: 2 } })).toBe("x aur 2");
  });

  it("throws when a placeholder has no value", () => {
    const error = (() => {
      try {
        tt(key("lesson.left"));
      } catch (e) {
        return e as ConfigError;
      }
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(error?.message).toContain("{minutes}");
  });

  it("falls back to Roman Urdu while the Urdu-script text is missing", () => {
    expect(tt(key("app.name"), { locale: "ur" })).toBe("Bolo");
  });

  it("uses the Urdu-script text when it exists, including placeholders", () => {
    expect(tt(key("lesson.left"), { locale: "ur", params: { minutes: 3 } })).toBe("3 منٹ باقی");
  });

  it("throws for a key that does not exist anywhere", () => {
    expect(() => tt(key("nope.nothing"))).toThrow(ConfigError);
    expect(() => tt(key("nope.nothing"))).toThrow(/ur-Latn\.nope\.nothing/);
  });

  it("throws for a key that is null in the default locale, even if another locale has text", () => {
    expect(() => tt(key("lesson.pending"))).toThrow(/null/);
  });

  it("throws when the key points at a group, not a text", () => {
    expect(() => tt(key("lesson"))).toThrow(ConfigError);
  });
});
