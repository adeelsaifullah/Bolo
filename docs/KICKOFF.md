# Bolo: how development runs with Claude Code

This file is for the founder and for Claude Code. It sets the order of sessions and gives a ready prompt for each one. Rules for every session are in `CLAUDE.md`.

## How every session works

1. Open claude.ai/code (or the Code tab in the Claude app), pick **only** the `adeelsaifullah/bolo` repository (never Quant-AI), and choose **Plan** mode.
2. Paste the prompt for the next session below. Claude shows a plan first; read it, answer its questions, then approve.
3. When it finishes, open the diff, check it, then **Create PR** and merge it on GitHub.
4. Merge before starting the next session, so the next one starts from the updated `main`.
5. Test on a real low-end Android phone (360 px wide, throttled 3G) as the session tells you. Report bugs in the format at the end of `CLAUDE.md`.

API keys never go in chat or in files. Add them to the cloud environment as **Network secrets** (environment settings in claude.ai/code), or to `.env.local` on your own laptop.

## Order of work

The Business Plan approves **Phase 0 only** first. Phase 1 screens start after G0 passes (PRD section 2). So the order is:

| Session | Phase | What | Needs PRD? |
|---|---|---|---|
| P0-1 | 0 | Foundation: project setup, config loader, provider interfaces, cost logger | **Done** (commit e86a68b: 117 tests, lint, typecheck, build pass) |
| P0-2 | 0 | Voice test harness: 40 recordings, accuracy and real AI cost per minute | Yes, for providers and target |
| P0-3 | 0 | Lesson format, tutor prompt for the WhatsApp pilot, interview Days 1-14 drafts | Yes, for lesson structure |
| P1-xx | 1 | One screen or one pipeline step per session, in the PRD's order | Yes |

### Phase 0 items only the founder can do (Business Plan sections 11 and 14)

- [ ] Read the employment contract and get written employer consent for side work
- [ ] Business-name payment account, NTN, and one real PKR 499 test payment
- [ ] Written BEOE opinion (needed before any Gulf track, Phase 3)
- [ ] Check Meta ad rules for the landing page and ads
- [ ] Collect 40 voice recordings, each with a stored consent version, for P0-2
- [ ] Run the 20-user, 14-day WhatsApp pilot and check the G0 pass rule
- [ ] When G0 passes, tick this box and tell the next Claude Code session that Phase 1 can start

---

## P0-1: Foundation (no screens, no database tables) — done

Kept for reference; this session has already run.

```text
Session P0-1: Foundation. No screens and no database tables in this session.

Read CLAUDE.md, docs/BUSINESS_PLAN.md, docs/DECISIONS.md and docs/KICKOFF.md first (and docs/PRD.md if it has been added).

Goal: set up the bare project so later sessions only add screens and pipeline steps.
1. Next.js (App Router, TypeScript strict) as a mobile-first PWA shell for 360 px screens. Set up the Supabase client for server and browser, but create no tables yet.
2. /lib/config: loads config/plans.json, config/app.json and config/strings.json, validates them, and throws a clear error when a feature asks for a value that is missing or null.
3. A t(key) text helper that reads config/strings.json (default ur-Latn, Urdu-script option). No text inside components.
4. Provider interfaces in /lib for stt, llm, tts and payments, each with a mock or manual implementation chosen by env name. No real provider yet.
5. /lib/cost: turns a provider's USD cost into PKR using FX_PKR_PER_USD and returns both numbers, ready to be saved on each attempt later.
6. A safe logger that never prints audio, transcripts, phone numbers or payment screenshots.
7. Lint, typecheck, and unit tests for the config loader, the text helper and the cost logger.

Start with a plan and the list of libraries you want to add, with their licences. Ask before adding any paid service. End with: files added, how to run it, and what to merge.
```

## P0-2: Voice test harness (Phase 0 pipeline step)

Build it in Claude Code, but run it on your own laptop: the recordings are private audio and never go to GitHub (`voice-test/recordings/` is git-ignored).

```text
Session P0-2: Voice test harness. Phase 0 pipeline step, no app screens.

Read CLAUDE.md and the PRD sections on the voice test, G0 and providers first.

Goal: test speech-to-text and the feedback model on 40 real Pakistani recordings before Phase 1, and measure the real AI cost per minute.
1. One command (for example npm run voice-test) that reads audio from voice-test/recordings/ and a consent.csv (file, consent_version, date). It refuses any file without a consent version, because no audio may reach an AI provider before consent is stored.
2. For each file: speech-to-text through /lib/stt, then the feedback step through /lib/llm (0-100 Practice Score and 3 corrections explained in Urdu). Time both steps.
3. Compare each transcript with a human reference in reference.csv and report word error rate per file and overall (and per speaker group if the CSV has one).
4. Log provider cost in USD and PKR per file and per audio minute, and compare it with the planning number `economics.ai_cost_pkr_per_active_minute_planning` (1.5 PKR) in config/app.json.
5. Write results to voice-test/results/ (git-ignored): a CSV and a short summary.md with accuracy, cost per minute, latency and failed files, against the PRD's voice-test target.

Before writing any adapter, ask me which one or two providers to test (the PRD lists them). Keys come only from the environment. Plan first, then build, then give me exact steps to run it on my laptop.
```

## P0-3: Lesson format, pilot tutor prompt, interview Days 1-14

```text
Session P0-3: Lesson format, tutor prompt and interview-track Days 1-14 drafts.

Read CLAUDE.md and the PRD sections on the daily loop and content first.

Goal: one lesson format used both by the WhatsApp pilot (which I run in Claude chat) and later by the Phase 1 app.
1. A lesson schema and validator in /content: day, track, 3-4 phrases with Urdu meaning, a 4-6 turn roleplay with the tutor's lines and what the learner should say, and a status field (draft or approved). Follow the PRD's lesson structure if it defines one.
2. /prompts/tutor-feedback.md, versioned: gives a 0-100 Practice Score and exactly 3 corrections explained in simple Urdu or Roman Urdu; no pronunciation score; no job, visa or salary promise. Also a pilot version I can paste into Claude chat to run one day's lesson.
3. Drafts for interview-track Days 1-14, all with status "draft". Use only general, public interview knowledge, never any employer's material. I will review each one and set it to "approved".

Check every line against the copy rules in CLAUDE.md. Plan first.
```

## P1-xx: one screen per session (after G0)

Take screens in the order the PRD gives (S01 first, which includes the in-app browser check before the level test). Change the ID and name each time.

```text
Session P1-<ID>: <screen ID and name from the PRD>.

Read CLAUDE.md and the PRD section for <ID>. Build only this screen or this one pipeline step and the server parts it needs.

Plan first and wait for my OK. The plan lists: the screen states, API routes, tables with row-level security, the config keys and strings keys you will add, the caps you will enforce on the server, and the PRD section 11 events you will log.
Then build it with tests. Use the screen ID in file names, the commit message and the tests.
End with the test on a real low-end Android phone (360 px, throttled 3G) and what to merge.
```
