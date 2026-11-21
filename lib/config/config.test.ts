import { describe, expect, it } from "vitest";
import appJson from "@/config/app.json";
import plansJson from "@/config/plans.json";
import stringsJson from "@/config/strings.json";
import { ConfigError, createConfigReader, getConfig, optionalEnv, parseConfig, requireConfig, requireEnv } from "./index";

const clone = <T,>(value: T): T => structuredClone(value);
const raw = () => ({ plans: clone(plansJson), app: clone(appJson), strings: clone(stringsJson) });

/** Paths of every null value in a parsed JSON file, e.g. "plans.free.minutes". */
function nullPaths(value: unknown, prefix: string): string[] {
  if (value === null) return [prefix];
  if (typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => nullPaths(child, `${prefix}.${key}`));
}

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

  it("keeps exactly these values null, because the PRD gives no number for them", () => {
    // If you fill one of these, or add a new null, update this list on purpose.
    expect([...nullPaths(plansJson, "plans"), ...nullPaths(appJson, "app")].sort()).toEqual([
      "plans.plans.founding_pro.renewal_price_pkr", // PRD 5.5: a rule (the user's Pro 30 price), not a number
      "plans.plans.free.day_cap_minutes", // PRD 16: the free plan uses free_allowance instead
      "plans.plans.free.duration_days", // PRD 16: not used
      "plans.plans.free.minutes", // PRD 16: not used
    ]);
  });
});

// Values added in P0-1b. Each row is [file, key, value, PRD section that gives it].
describe("values filled from PRD section 16", () => {
  const requireAny = (file: "app" | "plans", path: string) =>
    (getConfig().require as (f: "app" | "plans", p: string) => unknown)(file, path);

  it.each([
    ["app", "app.day_starts_at_hour_pkt", 4, "4.9"],
    ["app", "limits.anonymous_test.per_device_per_day", 2, "10"],
    ["app", "limits.anonymous_test.per_ip_per_day", 10, "10"],
    ["app", "limits.anonymous_test.global_per_day", 150, "10"],
    ["app", "limits.rate_limit_requests_per_minute", 30, "10"],
    ["app", "limits.ai_calls_per_minute", 6, "10"],
    ["app", "limits.daily_free_ai_budget_pkr", 1500, "10"],
    ["app", "limits.lesson_data_budget_mb", 1.5, "14"],
    ["app", "limits.pwa_cache_max_mb", 5, "14"],
    ["app", "consent.version", "ur-v1-2026-11", "9"],
    ["app", "payments.methods", ["easypaisa", "jazzcash", "raast"], "8"],
    [
      "app",
      "payments.approval_windows",
      [
        { start: "08:00", end: "08:30" },
        { start: "13:00", end: "13:30" },
        { start: "22:00", end: "23:30" },
      ],
      "8",
    ],
    ["plans", "plans.sprint_14.day_cap_minutes", 15, "5.3"],
    ["plans", "plans.pro_30.day_cap_minutes", 15, "5.3"],
    ["plans", "plans.founding_pro.day_cap_minutes", 15, "5.3"],
    ["plans", "plans.weekly_299.day_cap_minutes", 15, "5.3"],
    ["plans", "plans.plus_1499.payment_mode", "gateway_autopay", "5.1"],
    ["plans", "plans.plus_1499.duration_days", 30, "5.1"],
    ["plans", "plans.plus_1499.minutes", 300, "5.1"],
    ["plans", "plans.plus_1499.day_cap_minutes", 15, "5.1"],
    ["plans", "plans.team.phase", 1, "5.4"],
    // G0 voice-test thresholds, added in P0-2 so the harness does not hard-code them (rule 3).
    ["app", "gates.g0.voice_test_min_recordings", 40, "2"],
    ["app", "gates.g0.voice_test_min_speakers", 15, "2"],
    ["app", "gates.g0.min_corrections_judged_right", 0.9, "2"],
    ["app", "gates.g0.max_wer_overall", 0.2, "2"],
    ["app", "gates.g0.max_wer_per_speaker_group", 0.25, "2"],
    ["app", "gates.g0.max_ai_cost_pkr_per_active_minute", 2, "2"],
  ] as const)("%s %s = %j (PRD %s)", (file, path, value, section) => {
    expect(requireAny(file, path), `config/${file}.json "${path}" should match PRD section ${section}`).toEqual(value);
  });

  it("no longer has the old single approval window", () => {
    const data = raw();
    (data.app.payments as Record<string, unknown>).approval_window = { sla_minutes: null, start_hour: null, end_hour: null };
    expect(catchError(() => parseConfig(data)).message).toContain("config/app.json");
  });
});

describe("caps agree with each other", () => {
  const requireAny = (file: "app" | "plans", path: string) =>
    (getConfig().require as (f: "app" | "plans", p: string) => number)(file, path);

  it.each(["sprint_14", "pro_30", "founding_pro", "weekly_299"])(
    "%s uses the global B2C day cap, so the two cannot drift apart (PRD 5.3)",
    (plan) => {
      expect(requireAny("plans", `plans.${plan}.day_cap_minutes`)).toBe(requireAny("app", "limits.day_cap_minutes"));
    },
  );

  it("Team learners have a lower day cap than B2C learners (PRD 5.3)", () => {
    expect(requireAny("plans", "plans.team.day_cap_minutes")).toBeLessThan(requireAny("app", "limits.day_cap_minutes"));
  });

  it("free usage at the caps costs no more than the daily free-AI budget at the planning cost per minute (PRD 10)", () => {
    const testMinutes = requireAny("app", "limits.anonymous_test.global_per_day") * requireAny("plans", "plans.free.free_allowance.level_test_minutes");
    const lessonMinutes = requireAny("app", "limits.free_first_lessons_per_day") * requireAny("plans", "plans.free.free_allowance.first_lesson_minutes");
    const cost = (testMinutes + lessonMinutes) * requireAny("app", "economics.ai_cost_pkr_per_active_minute_planning");
    expect(cost).toBeLessThanOrEqual(requireAny("app", "limits.daily_free_ai_budget_pkr"));
  });
});

describe("requiring a value", () => {
  it("throws a clear error naming the file and key when the value is null", () => {
    const data = raw();
    (data.app.consent as { version: string | null }).version = null;
    const error = catchError(() => createConfigReader(parseConfig(data)).require("app", "consent.version"));
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

  describe("approval windows", () => {
    const withWindows = (windows: unknown) => {
      const data = raw();
      (data.app.payments as { approval_windows: unknown }).approval_windows = windows;
      return data;
    };

    it.each([
      ["a time without a leading zero", [{ start: "8:00", end: "08:30" }], "approval_windows.0.start"],
      ["an hour past 23", [{ start: "08:00", end: "24:00" }], "approval_windows.0.end"],
      ["an end that is not after the start", [{ start: "13:30", end: "13:00" }], "approval_windows.0.end"],
      ["a window that crosses midnight", [{ start: "23:00", end: "00:30" }], "approval_windows.0.end"],
      [
        "windows that overlap",
        [
          { start: "08:00", end: "09:00" },
          { start: "08:30", end: "10:00" },
        ],
        "approval_windows.1.start",
      ],
      [
        "windows out of time order",
        [
          { start: "13:00", end: "13:30" },
          { start: "08:00", end: "08:30" },
        ],
        "approval_windows.1.start",
      ],
      ["an empty list", [], "approval_windows"],
    ])("rejects %s", (_name, windows, path) => {
      const error = catchError(() => parseConfig(withWindows(windows)));
      expect(error.reason).toBe("invalid");
      expect(error.message).toContain("config/app.json");
      expect(error.message).toContain(`payments.${path}`);
    });

    it("accepts windows that touch end to start", () => {
      const touching = [
        { start: "08:00", end: "08:30" },
        { start: "08:30", end: "09:00" },
      ];
      expect(() => parseConfig(withWindows(touching))).not.toThrow();
    });
  });

  describe("payment methods", () => {
    const withMethods = (methods: unknown) => {
      const data = raw();
      (data.app.payments as { methods: unknown }).methods = methods;
      return data;
    };

    it.each([
      ["an unknown method", ["easypaisa", "paypal"]],
      ["a method listed twice", ["jazzcash", "jazzcash"]],
      ["an empty list", []],
    ])("rejects %s", (_name, methods) => {
      expect(catchError(() => parseConfig(withMethods(methods))).message).toContain("payments.methods");
    });
  });

  it.each([-1, 24, 4.5])("rejects a day-start hour of %j", (hour) => {
    const data = raw();
    (data.app.app as { day_starts_at_hour_pkt: number }).day_starts_at_hour_pkt = hour;
    expect(catchError(() => parseConfig(data)).message).toContain("app.day_starts_at_hour_pkt");
  });

  it.each(["lesson_data_budget_mb", "pwa_cache_max_mb"] as const)("rejects a zero or negative %s", (key) => {
    for (const value of [0, -1]) {
      const data = raw();
      data.app.limits[key] = value;
      expect(catchError(() => parseConfig(data)).message).toContain(`limits.${key}`);
    }
  });

  it("rejects an unknown payment mode", () => {
    const data = raw();
    (data.plans.plans.plus_1499 as { payment_mode: unknown }).payment_mode = "card";
    expect(catchError(() => parseConfig(data)).message).toContain("plans.plus_1499.payment_mode");
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
