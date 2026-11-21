import { z } from "zod";

export const LOCALES = ["ur-Latn", "ur"] as const;
export type Locale = (typeof LOCALES)[number];
const locale = z.enum(LOCALES);

// A value that may not be decided yet. null is valid in the file but throws when a feature reads it.
const num = z.number().nullable();
const positive = z.number().positive().nullable();
const count = z.number().int().nonnegative().nullable();

// ---------- plans.json ----------
// auto_pay is what Weekly 299 uses (Phase 2). gateway_autopay is the value PRD section 16 gives for Plus (Phase 3).
const paymentMode = z.enum(["none", "manual", "auto_pay", "gateway_autopay", "invoice"]).nullable();

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
      /**
       * Stays null on purpose. PRD 5.5 and 16 give a rule, not a number: Founding Pro renews at the user's own
       * Pro 30 price (799, or 999 in the price-test group). Read plans.pro_30 instead of typing a number here.
       */
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
export const PAYMENT_METHODS = ["easypaisa", "jazzcash", "raast"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A 24-hour clock time in Pakistan time, such as "08:00". */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a 24-hour time such as "08:00"');
const minutesOfDay = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export const appSchema = z.strictObject({
  app: z.strictObject({
    default_locale: locale,
    current_phase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    tracks: z.array(z.string().min(1)),
    /** A "Bolo day" runs from this hour to the same hour next day, Pakistan time (PRD 4.9). Resets day caps and streaks. */
    day_starts_at_hour_pkt: z.number().int().min(0).max(23).nullable(),
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
    /** All requests per minute, per user (PRD 10). */
    rate_limit_requests_per_minute: count,
    /** AI calls per minute, per user (PRD 10). */
    ai_calls_per_minute: count,
    daily_free_ai_budget_pkr: count,
    /** Most data one full lesson may use, in MB, tutor audio and uploads included (PRD 14). */
    lesson_data_budget_mb: positive,
    /** Largest the PWA cache may grow, in MB (PRD 14). */
    pwa_cache_max_mb: positive,
  }),
  /** What a lesson file may contain (PRD 4.1 and 4.7). The lesson validator in /content reads these. */
  lessons: z
    .strictObject({
      /** Length of each track in days. */
      track_days: count,
      /** Days of each track that are live at launch; the rest are released weekly. */
      launch_days_per_track: count,
      phrases_min: count,
      phrases_max: count,
      turns_min: count,
      turns_max: count,
      /** Authoring limit: keeps the tutor's spoken line (and its audio) short. */
      tutor_line_max_words: count,
      /** Authoring limit: a model answer must be easy to say well inside limits.answer_max_seconds. */
      model_answer_max_words: count,
    })
    .superRefine((lessons, ctx) => {
      for (const [min, max] of [["phrases_min", "phrases_max"], ["turns_min", "turns_max"]] as const) {
        const low = lessons[min];
        const high = lessons[max];
        if (low !== null && high !== null && low > high) ctx.addIssue({ code: "custom", path: [min], message: `must not be more than ${max}` });
      }
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
    /** Wallets and bank rails users can pay into (PRD 8 and 16). */
    methods: z
      .array(z.enum(PAYMENT_METHODS))
      .min(1)
      .refine((methods) => new Set(methods).size === methods.length, "a payment method is listed twice"),
    /**
     * Times of day, Pakistan time, when payments are decided (PRD 8). A payment is decided in the next window.
     * List them in time order. A window cannot cross midnight.
     */
    approval_windows: z
      .array(z.strictObject({ start: clockTime, end: clockTime }))
      .min(1)
      .superRefine((windows, ctx) => {
        windows.forEach((window, index) => {
          if (minutesOfDay(window.start) >= minutesOfDay(window.end)) {
            ctx.addIssue({ code: "custom", path: [index, "end"], message: "must be later than start (a window cannot cross midnight)" });
          }
          const previous = windows[index - 1];
          if (previous && minutesOfDay(window.start) < minutesOfDay(previous.end)) {
            ctx.addIssue({ code: "custom", path: [index, "start"], message: "must not start before the previous window ends (list windows in time order)" });
          }
        });
      }),
    approvals_per_day_warning: count,
  }),
  economics: z.strictObject({
    ai_cost_pkr_per_active_minute_planning: num,
  }),
  gates: z.strictObject({
    /**
     * Only the G0 numbers the voice test (P0-2) checks: PRD 2 items 4 and 5 and the sample size.
     * Demand, use and repeat are measured in the WhatsApp pilot, not in code.
     */
    g0: z.strictObject({
      voice_test_min_recordings: count,
      voice_test_min_speakers: count,
      /** Share of corrections the founder judges right, 0 to 1. */
      min_corrections_judged_right: z.number().min(0).max(1).nullable(),
      /** Word error rate, 0 to 1, over all recordings. */
      max_wer_overall: z.number().min(0).max(1).nullable(),
      /** Word error rate, 0 to 1, for every speaker group on its own. */
      max_wer_per_speaker_group: z.number().min(0).max(1).nullable(),
      max_ai_cost_pkr_per_active_minute: num,
    }),
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
