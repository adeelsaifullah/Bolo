# Bolo

Mobile-first PWA (Next.js App Router, TypeScript strict) where Pakistani job seekers practise spoken English.
This repo is Bolo only and shares nothing with the founder's other projects. P0-1 (foundation), P0-1b (config values
from PRD section 16), P0-2 (voice test harness, built; the run is yours) and P0-3 (lesson format, tutor prompts, interview
Days 1-14 drafts, waiting for your review) are done: no screens, no database tables yet.
Later sessions add one screen or one pipeline step each. Read `CLAUDE.md` (build rules), `docs/PRD.md`,
`docs/BUSINESS_PLAN.md`, `docs/DECISIONS.md` and `docs/KICKOFF.md` (session order and prompts) first.

## Run it

Needs Node 22+.

```bash
npm install
cp .env.example .env.local   # fill in values; the app shell runs without Supabase keys
npm run dev                  # http://localhost:3000
```

```bash
npm run check                # lint + typecheck + unit tests (run this before every commit)
npm run build && npm start   # production build; the service worker only registers in production
```

## Where things live

| Path | What it does | Build rule |
|---|---|---|
| `config/plans.json`, `config/app.json` | Every price, plan, cap, threshold and window. `null` means "not decided yet". | 3 |
| `config/strings.json` | All user-facing text. `ur-Latn` (Roman Urdu) is the default, `ur` is Urdu script. | 4 |
| `lib/config` | Loads and validates the three files. `requireConfig("app", "limits.day_cap_minutes")` throws a `ConfigError` naming the file and key if the value is missing or `null`. `requireEnv` does the same for env vars. | 3 |
| `lib/i18n` | `t("common.retry")`, `t(key, { locale: "ur", params })`. Keys are type-checked. ESLint fails the build on literal text in JSX. | 4 |
| `lib/stt`, `lib/llm`, `lib/tts`, `lib/payments` | Provider interfaces plus a `mock` (payments: `manual` and `mock`), chosen by `STT_PROVIDER`, `LLM_PROVIDER`, `TTS_PROVIDER`, `PAYMENTS_PROVIDER`. Real adapters so far: stt `deepgram` and `openai`, llm `openai` and `gemini` (plain `fetch`, keys from env only, tested with a fake `fetch`; not yet tried against the real services). STT refuses to run without a stored consent version. | 8, copy rules |
| `voice-test/`, `prompts/` | P0-2 voice test: `npm run voice-test -- --help`. Run it on your laptop; recordings and results are git-ignored. Steps in `voice-test/README.md`. It uses `prompts/tutor-feedback.md`, the feedback prompt the app will ship; `prompts/tutor-pilot.md` is the WhatsApp pilot prompt. Prompts are versioned and pinned by a test. | 5, copy rules |
| `content/` | P0-3 lessons: `content/<track>/day-NN.json` (interview Days 1-14, all drafts), the lesson format and validator, a copy-rule scanner, and generated pilot packs in `content/pilot/`. `npm run content:check`, `npm run content:pilot`. Review guide: `content/README.md`. | 4, copy rules |
| `lib/cost` | `usdToPkr(costUsd)` returns `{ costUsd, costPkr, fxPkrPerUsd }` using `FX_PKR_PER_USD`, ready to save on an attempt. `sumCosts` adds the calls of one attempt. | 6 |
| `lib/log` | Safe JSON logger. Redacts audio, transcripts, phone numbers, screenshots, tokens, by key name and by value shape. ESLint bans `console` everywhere else. | 5 |
| `lib/supabase` | Browser and server clients (anon key only). No service-role client yet. | 5, 10 |
| `app/manifest.ts`, `public/sw.js` | PWA manifest and a tiny service worker that caches only immutable static files. | |

## Adding a real provider later

1. Implement the interface in `lib/<kind>/types.ts` in a new file, e.g. `lib/stt/deepgram.ts`.
2. Register it in that kind's `registry` in `lib/<kind>/index.ts`.
3. Set `STT_PROVIDER=deepgram`. Ask before adding any paid service or SDK (rule 9).

## Missing inputs (placeholders to replace)

- Config values from PRD v2.0 section 16 are filled. Four values stay `null` on purpose (`plans.free.duration_days`,
  `plans.free.minutes`, `plans.free.day_cap_minutes`, `plans.founding_pro.renewal_price_pkr`); a test lists them, and
  anything that reads one throws a `ConfigError` naming the file and key.
- `config/strings.json` has 5 starter texts. The Urdu wording needs a native-speaker review.
- `public/icons/*.png` and `pwa.theme_color` are placeholders, not branding.
