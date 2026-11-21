# Bolo

Mobile-first PWA (Next.js App Router, TypeScript strict) where Pakistani job seekers practise spoken English.
This folder is **P0-1: Foundation**: no screens, no database tables. Later sessions add one screen or one
pipeline step each. Read `docs/PRD.md` and the build rules first (not in this folder yet; see "Missing inputs").

## Run it

Needs Node 22+.

```bash
cd bolo
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
| `lib/stt`, `lib/llm`, `lib/tts`, `lib/payments` | Provider interfaces plus a `mock` (payments: `manual` and `mock`), chosen by `STT_PROVIDER`, `LLM_PROVIDER`, `TTS_PROVIDER`, `PAYMENTS_PROVIDER`. STT refuses to run without a stored consent version. | 8, copy rules |
| `lib/cost` | `usdToPkr(costUsd)` returns `{ costUsd, costPkr, fxPkrPerUsd }` using `FX_PKR_PER_USD`, ready to save on an attempt. `sumCosts` adds the calls of one attempt. | 6 |
| `lib/log` | Safe JSON logger. Redacts audio, transcripts, phone numbers, screenshots, tokens, by key name and by value shape. ESLint bans `console` everywhere else. | 5 |
| `lib/supabase` | Browser and server clients (anon key only). No service-role client yet. | 5, 10 |
| `app/manifest.ts`, `public/sw.js` | PWA manifest and a tiny service worker that caches only immutable static files. | |

## Adding a real provider later

1. Implement the interface in `lib/<kind>/types.ts` in a new file, e.g. `lib/stt/deepgram.ts`.
2. Register it in that kind's `registry` in `lib/<kind>/index.ts`.
3. Set `STT_PROVIDER=deepgram`. Ask before adding any paid service or SDK (rule 9).

## Missing inputs (placeholders to replace)

- `docs/PRD.md` and `docs/KICKOFF.md` were not available. Values only they define are `null` in config
  (consent version, anonymous-test caps, rate limits, daily free-AI budget, approval windows). Fill them in
  `config/app.json` when the PRD is added; features that need them will throw until then.
- `config/strings.json` has 5 starter texts. The Urdu wording needs a native-speaker review.
- `public/icons/*.png` and `pwa.theme_color` are placeholders, not branding.
