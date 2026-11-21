import { z } from "zod";

export const LOCALES = ["ur-Latn", "ur"] as const;
export type Locale = (typeof LOCALES)[number];
const locale = z.enum(LOCALES);

// A value that may not be decided yet. null is valid in the file but throws when a feature reads it.
const num = z.number().nullable();
const count = z.number().int().nonnegative().nullable();

// ---------- plans.json ----------
const paymentMode = z.enum(["none", "manual", "auto_pay", "invoice"]).nullable();

const basePlan = {
  phase: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  payment_mode: paymentMode,
  price_pkr: count,
  duration_days: count,
  /** Minutes wallet granted by the plan. */
  minutes: count,
  /** Per-plan day cap; null means "use limits.day_cap_minutes from app.json". */
  day_cap_minutes: count,
};

export const plansSchema = z.strictObject({
  currency: z.literal("PKR"),
  plans: z.strictObject({
    free: z.strictObject({
      ...basePlan,
      free_allowance: z.strictObject({
        level_test_minutes: count,
        first_lesson_minutes: count,
        first_lesson_per_phone: count,
      }),
    }),
    sprint_14: z.strictObject(basePlan),
    pro_30: z.strictObject({
      ...basePlan,
      price_test: z.strictObject({
        alt_price_pkr: count,
        share_of_new_users: z.number().min(0).max(1).nullable(),
      }),
    }),
    founding_pro: z.strictObject({
      ...basePlan,
      limited_to_first_users: count,
      renewal_price_pkr: count,
    }),
    weekly_299: z.strictObject(basePlan),
    plus_1499: z.strictObject(basePlan),
    team: z.strictObject({
      ...basePlan,
      team_terms: z.strictObject({
        price_unit: z.literal("per_learner_month").nullable(),
        min_learners: count,
        pilot_weeks: count,
        max_advance_share: z.number().min(0).max(1).nullable(),
      }),
    }),
  }),
});

// ---------- app.json ----------
export const appSchema = z.strictObject({
  app: z.strictObject({
    default_locale: locale,
    current_phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    tracks: z.array(z.string().min(1)),
  }),
  locales: z.strictObject({
    "ur-Latn": z.strictObject({ dir: z.enum(["ltr", "rtl"]) }),
    ur: z.strictObject({ dir: z.enum(["ltr", "rtl"]) }),
  }),
  pwa: z.strictObject({
    theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  limits: z.strictObject({
    day_cap_minutes: count,
    answer_max_seconds: count,
    retries_per_step: count,
    free_first_lessons_per_day: count,
    anonymous_test: z.strictObject({
      per_device_per_day: count,
      per_ip_per_day: count,
      global_per_day: count,
    }),
    rate_limit_requests_per_minute: count,
    daily_free_ai_budget_pkr: count,
  }),
  retention: z.strictObject({
    audio_days: count,
    unclaimed_anonymous_audio_hours: count,
  }),
  consent: z.strictObject({
    /** Version of the consent text. Audio must never reach an AI provider without it. */
    version: z.string().min(1).nullable(),
  }),
  payments: z.strictObject({
    approval_window: z.strictObject({
      sla_minutes: count,
      start_hour: z.number().int().min(0).max(23).nullable(),
      end_hour: z.number().int().min(0).max(24).nullable(),
    }),
    approvals_per_day_warning: count,
  }),
  economics: z.strictObject({
    ai_cost_pkr_per_active_minute_planning: num,
  }),
  gates: z.strictObject({
    g1: z.strictObject({
      min_cumulative_unique_payers: count,
      min_day7_retention: z.number().min(0).max(1).nullable(),
      stop_below_day7_retention: z.number().min(0).max(1).nullable(),
      max_ai_cost_per_payer_pkr: num,
    }),
    g2: z.strictObject({ min_contribution_to_cac_ratio: num }),
  }),
});

// ---------- strings.json ----------
export type StringTree = { [key: string]: string | null | StringTree };
const stringTree: z.ZodType<StringTree> = z.lazy(() =>
  z.record(z.string(), z.union([z.string(), z.null(), stringTree])),
);

export const stringsSchema = z.strictObject({
  "ur-Latn": stringTree,
  ur: stringTree,
});

export type Plans = z.infer<typeof plansSchema>;
export type AppConfig = z.infer<typeof appSchema>;
export type Strings = z.infer<typeof stringsSchema>;
