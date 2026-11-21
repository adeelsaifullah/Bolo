# CLAUDE.md: rules for every Bolo session

Read docs/PRD.md first, then this file. Build only what the current phase lists (PRD section 2). Anything tagged \[VERIFY\] sits behind an adapter with a manual fallback; ask before integrating it.

## Project context (added at repo setup, 2026-11-21)

- This repo is **Bolo only**. It shares nothing with Quant-AI or any other repo of the founder: never read, copy, import or reference code or files from them.
- Source docs: `docs/PRD.md` (product, screens, phases, gates, events), `docs/BUSINESS_PLAN.md` (v2.1: prices, unit economics, gates), `docs/DECISIONS.md` (why each v1 → v2 change was made). If two docs disagree, stop and ask the founder; do not pick one silently.
- If `docs/PRD.md` still starts with `PRD NOT ADDED YET`, stop and ask the founder for it before any product or screen work.
- The project is in **Phase 0** (see the checklist in `docs/KICKOFF.md`). Only the Phase 0 sessions listed there are allowed (P0-1 foundation is done; next are the voice test and the pilot prompt/content). Phase 1 screens start only after the founder says in the session that G0 has passed and updates `docs/KICKOFF.md`. `app.current_phase` in `config/app.json` describes the app code (Phase 1 product) and is not this gate.
- The founder builds about 2 hours a day beside a 9-5 job. Keep plans short and in plain English, keep each session small enough to finish and review in one sitting, and end every session with: what changed, how to test it on the phone, and what to merge.

## Build rules

1.  One screen or one pipeline step per session. Plan first, implement second, then list how to test it on a real low-end Android phone (360 px wide, throttled 3G).

2.  Screen IDs (S01, A01...) go in file names, commit messages and tests.

3.  All prices, plans, caps, thresholds and approval windows come from config/plans.json and config/app.json; never hard-code a rupee amount or a limit.

4.  All user-facing text comes from config/strings.json (Roman Urdu by default, Urdu script option). No text in components.

5.  API keys exist only on the server. Never log audio, transcripts, phone numbers or payment screenshots to the console or error tracker.

6.  Every AI call logs its cost in PKR (using FX_PKR_PER_USD) and the raw provider cost to attempts.

7.  Enforce every cap on the server: minutes wallet, 15-minute day cap, 60-second answers, 2 retries per step, global free starts per day, rate limits. Never remove a cap to "make it work".

8.  Provider code (speech-to-text, LLM, TTS, payments) lives behind interfaces in /lib, so a provider can be swapped by config.

9.  Ask before adding any new paid service, SDK or library with a non-commercial licence.

10. Row-level security on every user table; admin routes check ADMIN_EMAILS.

## Copy and safety rules (non-negotiable)

- Never write or generate: a job, visa or salary promise; "verified", "official" or "certified" for any score or report; "Gulf job" wording in Phase 1; "10x cheaper than a tutor".

- The score output is a "Practice Score" and "Practice Report".

- Never collect CNIC numbers. Audio is deleted after 30 days; the user can delete it any time; never used to train models; consent text is stored with a version.

- Never send audio to an AI provider before the consent version is stored (the anonymous test included); delete unclaimed anonymous audio after 24 hours.

- No pronunciation score is shown. clarity_beta is stored but hidden in the Phase 1 UI and never used for gates or the paywall.

- No invented testimonials; ads and landing pages make no job promises.

## Testing rules

- Test each phase's screens end to end on a real phone before moving on; log events from section 11 of the PRD.

- Payments: test a real PKR 499 payment, a rejected payment, a refund and a duplicate transaction ID.

- Before the first paid user: Pro database live, provider spend limits and auto-recharge on, uptime alert working, a 50-user load test.

## Bug report format

Screen ID, phone model, network, steps, expected, actual, screenshot or recording.
