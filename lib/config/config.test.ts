import { describe, expect, it } from "vitest";
import appJson from "@/config/app.json";
import plansJson from "@/config/plans.json";
import stringsJson from "@/config/strings.json";
import { ConfigError, createConfigReader, getConfig, optionalEnv, parseConfig, requireConfig, requireEnv } from "./index";

const clone = <T,>(value: T): T => structuredClone(value);
const raw = () => ({ plans: clone(plansJson), app: clone(appJson), strings: clone(stringsJson) });

function catchError(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error("expected the call to throw a ConfigError");
}

describe("shipped config files", () => {
  it("all three validate", () => {
    expect(() => getConfig()).not.toThrow();
  });

  it("returns decided values from the Business Plan", () => {
    expect(requireConfig("plans", "plans.sprint_14.price_pkr")).toBe(499);
    expect(requireConfig("plans", "plans.sprint_14.minutes")).toBe(140);
    expect(requireConfig("plans", "plans.pro_30.price_test.alt_price_pkr")).toBe(999);
    expect(requireConfig("app", "limits.day_cap_minutes")).toBe(15);
    expect(requireConfig("app", "limits.answer_max_seconds")).toBe(60);
    expect(requireConfig("app", "limits.retries_per_step")).toBe(2);
    expect(requireConfig("app", "retention.audio_days")).toBe(30);
    expect(requireConfig("app", "retention.unclaimed_anonymous_audio_hours")).toBe(24);
  });

  it("keeps undecided values null instead of guessing them", () => {
    const { app } = getConfig().data;
    expect(app.consent.version).toBeNull();
    expect(app.limits.anonymous_test.global_per_day).toBeNull();
    expect(app.payments.approval_window.sla_minutes).toBeNull();
  });
});

describe("requiring a value", () => {
  it("throws a clear error naming the file and key when the value is null", () => {
    const error = catchError(() => requireConfig("app", "consent.version"));
    expect(error.reason).toBe("null");
    expect(error.source).toBe("app");
    expect(error.path).toBe("consent.version");
    expect(error.message).toContain('"consent.version"');
    expect(error.message).toContain("config/app.json");
    expect(error.message).toContain("null");
  });

  it("names the plans file for a null plan value", () => {
    const error = catchError(() => requireConfig("plans", "plans.founding_pro.renewal_price_pkr"));
    expect(error.message).toContain("config/plans.json");
    expect(error.reason).toBe("null");
  });

  it("throws when the key is missing", () => {
    const reader = createConfigReader(parseConfig(raw()));
    const error = catchError(() => (reader.require as (f: "app", p: string) => unknown)("app", "limits.no_such_limit"));
    expect(error.reason).toBe("missing");
    expect(error.message).toContain('"limits.no_such_limit"');
    expect(error.message).toContain("config/app.json");
  });

  it("does not treat 0 as missing", () => {
    expect(requireConfig("plans", "plans.free.price_pkr")).toBe(0);
  });

  it("does not walk into a primitive", () => {
    const reader = createConfigReader(parseConfig(raw()));
    const error = catchError(() => (reader.require as (f: "app", p: string) => unknown)("app", "limits.day_cap_minutes.deeper"));
    expect(error.reason).toBe("missing");
  });
});

describe("validation", () => {
  it("rejects a wrong type and names the file and path", () => {
    const data = raw();
    (data.plans.plans.sprint_14 as { price_pkr: unknown }).price_pkr = "499";
    const error = catchError(() => parseConfig(data));
    expect(error.reason).toBe("invalid");
    expect(error.message).toContain("config/plans.json");
    expect(error.message).toContain("plans.sprint_14.price_pkr");
  });

  it("rejects a negative amount", () => {
    const data = raw();
    data.app.limits.day_cap_minutes = -1;
    expect(catchError(() => parseConfig(data)).message).toContain("limits.day_cap_minutes");
  });

  it("rejects a misspelled key instead of ignoring it", () => {
    const data = raw();
    (data.app.limits as Record<string, unknown>).day_cap_minuts = 15;
    const error = catchError(() => parseConfig(data));
    expect(error.reason).toBe("invalid");
    expect(error.message).toContain("config/app.json");
  });

  it("rejects a missing required key", () => {
    const data = raw();
    delete (data.app.limits as Partial<typeof data.app.limits>).retries_per_step;
    expect(catchError(() => parseConfig(data)).message).toContain("limits.retries_per_step");
  });

  it("rejects a share outside 0 to 1", () => {
    const data = raw();
    data.plans.plans.pro_30.price_test.share_of_new_users = 30;
    expect(catchError(() => parseConfig(data)).message).toContain("share_of_new_users");
  });

  it("rejects a bad colour", () => {
    const data = raw();
    data.app.pwa.theme_color = "teal";
    expect(catchError(() => parseConfig(data)).message).toContain("pwa.theme_color");
  });

  it("rejects strings that are not text", () => {
    const data = raw();
    (data.strings["ur-Latn"].app as Record<string, unknown>).name = 5;
    expect(catchError(() => parseConfig(data)).message).toContain("config/strings.json");
  });

  it("reports how many more problems there are", () => {
    const data = raw();
    data.app.limits.day_cap_minutes = -1;
    data.app.limits.retries_per_step = -1;
    expect(catchError(() => parseConfig(data)).message).toContain("+1 more problem");
  });
});

describe("environment variables", () => {
  it("returns a trimmed value", () => {
    expect(requireEnv("X", "  abc ")).toBe("abc");
  });

  it.each([undefined, "", "   "])("treats %j as missing", (value) => {
    const error = catchError(() => requireEnv("MY_VAR", value));
    expect(error.reason).toBe("missing");
    expect(error.message).toContain("MY_VAR");
    expect(error.message).toContain(".env.example");
  });

  it("optionalEnv returns undefined for empty", () => {
    expect(optionalEnv("X", "")).toBeUndefined();
    expect(optionalEnv("X", " v ")).toBe("v");
  });
});
