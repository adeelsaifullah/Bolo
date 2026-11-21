# PRD v2.0: Bolo, Urdu-first AI English speaking coach

**Status:** Draft v2.0, 2026-11-21. Written from `docs/BUSINESS_PLAN.md` (v2.1), `docs/DECISIONS.md` and `CLAUDE.md`, because the original PRD v2 was not found. **Founder review is pending.**

**Tags:**
- **[PLAN]**: stated in the Business Plan v2.1, DECISIONS or CLAUDE.md. Do not change without the founder.
- **[PROPOSED]**: new in this draft, so that the build is not blocked. It is a starting value, kept in config where it is a number, and the founder can change it.
- **[VERIFY]**: must be checked before integrating. It sits behind an adapter with a manual fallback, and Claude Code asks before integrating it (CLAUDE.md).

Every price, cap, threshold and window is in `config/plans.json` or `config/app.json`. This PRD only gives starting values (section 16). If this PRD and another doc disagree, stop and ask the founder.

---

## 1. Product in one paragraph

Bolo is a mobile web app (PWA on Next.js and Supabase) where Pakistani job seekers practise job-focused spoken English for about 10 minutes a day. An AI tutor runs a short roleplay, gives a 0-100 Practice Score and explains 3 mistakes in Urdu. Phase 1 has two 30-day tracks: job interview and call centre. Trust comes before payment: a free 3-minute level test and a free first lesson. Payment is by mobile-wallet transfer with honest approval windows until a gateway arrives in Phase 2. [PLAN]

---

## 2. Phases and gates

### Phase 0: prove it before building (weeks 0-4, month 1) [PLAN]

**Build work (Claude Code):**
| ID | What | Status |
|---|---|---|
| P0-1 | Foundation: Next.js PWA shell, config loader, provider interfaces, cost logger, safe logger | Done |
| P0-2 | Voice test harness: 40 recordings, transcript accuracy, correction quality, latency, real AI cost per minute | Next |
| P0-3 | Lesson format, tutor feedback prompt (also used in the WhatsApp pilot), interview-track Days 1-14 drafts | Next |

**Founder work:** the 20-user WhatsApp pilot (20 users x PKR 499 for 14 days, run with Claude chat); employment contract read and written employer consent; business-name payment account, NTN and one real PKR 499 test payment; Urdu privacy policy draft; Meta ad rules check. [PLAN]

**Voice test (P0-2) [PLAN: 40 recordings; PROPOSED: the method]:**
- 40 recordings from at least 15 different speakers (pilot users with consent), mixing men and women, cities and levels.
- Each recording has a stored consent version and a reference transcript written by the founder.
- Measured: word error rate (WER) per file, overall and per speaker group; for each answer, whether each of the 3 corrections is right (the founder marks it); latency of transcription and feedback; cost in USD and PKR per audio minute.
- Test one or two provider combinations, chosen by the founder (section 13).

**G0 pass rule [PROPOSED]:** all six must pass before Phase 1 starts.
1. **Demand:** at least 15 of the 20 pilot seats are paid at PKR 499 within 21 days of opening.
2. **Use:** at least 50% of paid pilot users complete 10 or more of the 14 days.
3. **Repeat:** at least 40% of paid pilot users pay for a second pack (Sprint or Pro) at the list price.
4. **Feedback quality:** at least 90% of corrections are judged right by the founder, and transcript WER is at most 20% overall and at most 25% for any speaker group.
5. **Cost:** measured AI cost is at most PKR 2.0 per active minute (planning number 1.5).
6. **Admin:** written employer consent, and the business payment account has taken one real PKR 499 payment.

If item 4 or 5 fails, test one other provider. If it still fails, stop before Phase 1. If item 1 or 2 fails, change the offer or stop; do not build Phase 1.

### Phase 1: build (months 2-4, about 12-14 weeks, about 110-130 build hours) [PLAN]

**In Phase 1:**
- Screens S01-S14 and admin screens A01 and A02-lite (sections 6 and 7).
- Two 30-day tracks, `interview` and `callcenter`. Days 1-14 are live at launch; the rest are released weekly.
- Free 3-minute level test (anonymous) and a free 10-minute first lesson (once per phone).
- Streak and badges. Practice Report.
- Manual wallet payments with approval windows, SMS-paste matcher, batch approve, provisional access, payment-rejected flow and refund (section 8).
- Free-usage controls (section 10), Urdu consent (section 9).
- On S07: PWA install prompt, renewal card and day-28 offer.
- Help, report wrong correction, refund, payment rejected, script choice on screen 1, spoken instructions.
- Team pilot support without a dashboard, built only when a pilot is signed (section 5.4).

**Not in Phase 1:** "My Mistakes" replay, monthly grade and rewards, referral, weekly plan, payment gateway, B2B dashboard (all Phase 2); any pronunciation score, Plus plan, Gulf track (Phase 3); any certificate.

**Soft launch:** start of month 5, after G0 and the pre-launch checks in CLAUDE.md. [PLAN]

### G1: 60 days after soft launch (end of month 6) [PLAN]
At least 45 cumulative unique payers, day-7 retention at least 25%, AI cost at most PKR 350 per payer. **Stop rule:** under 45 payers or day-7 retention under 20% stops ads and new building.

### Phase 2: retention and payments (months 7-11, about 12-16 weeks) [PLAN]
Gateway with auto-pay, Weekly 299 (auto-pay only), referral (both get 3 free days after the friend pays), "My Mistakes" replay, monthly grade and rewards, next-track offer, weekly mock, B2B dashboard.

### G2 [PLAN]
Contribution per payer divided by CAC is at least 2 before paid ads scale.

### Phase 3 [PLAN]
Real pronunciation scoring (spike first, provider validated on Pakistani accents), Plus PKR 1,499 with live mock calls, "Workplace English: Gulf" only after a written BEOE opinion, an employer-recognised report only with a signed partner.

### Month 12 [PLAN]
Review against the scenarios in the Business Plan: scale, hold or stop.

---

## 3. Users and principles

- **Primary user [PLAN]:** urban Android users aged 20-30, wallet users, preparing for call-centre or general job interviews. Many arrive from a TikTok, Instagram or Facebook ad inside an in-app browser, on a low-end phone and a slow connection.
- **Second [PLAN]:** call-centre training teams (B2B, section 5.4).
- **Not in Phase 1 [PLAN]:** Gulf-bound workers.

**Principles:**
1. Trust before payment: free test, free first lesson, founder's real name and face, honest approval windows, refund promise, Urdu privacy policy. [PLAN]
2. Urdu explains, English is practised. Roman Urdu by default, Urdu script as an option. [PLAN]
3. About 10 minutes a day. [PLAN]
4. Honest copy: every rule in the CLAUDE.md copy and safety section applies to screens, ads, WhatsApp texts and reports. [PLAN]
5. Works on a cheap Android phone on 3G (section 14). [PLAN: 360 px, throttled 3G]
6. WhatsApp is used only for onboarding, reminders and confirmations. [PLAN] In Phase 1 that means wa.me links and manual sends from the WhatsApp Business app, using texts kept in `strings.json`; no WhatsApp API. [PROPOSED]

---

## 4. Daily lesson loop and scoring

### 4.1 Lesson structure [PLAN]
1. **Learn:** 3-4 phrases, each with English text, Urdu meaning and tutor audio.
2. **Roleplay:** 4-6 turns. The tutor's line plays as audio with text; the learner records an answer of up to 60 seconds; 2 retries per step.
3. **Feedback:** after each turn and at the end of the lesson (section 4.2).

### 4.2 Feedback [PLAN]
A 0-100 **Practice Score** and exactly **3 corrections**. Each correction shows what the learner said, a better way to say it, and a 1-2 line explanation in Urdu (in the learner's chosen script).

### 4.3 How the Practice Score is made [PROPOSED]
The LLM scores each answer with a fixed rubric: fit to the task 40, grammar 25, use of the lesson's phrases and vocabulary 20, fluency 15 (from transcript timing: words per minute and long pauses). The lesson score is the average of its turns. Bands, with text in `strings.json`: 0-39, 40-69, 70-100. The rubric and prompt are versioned files in `/prompts`, and the prompt version is stored on every attempt.

### 4.4 clarity_beta [PLAN]
Stored on every attempt, hidden in the Phase 1 UI, and never used for gates, the paywall or the Practice Score. No pronunciation score is shown anywhere.

### 4.5 Report wrong correction [PLAN]
Each correction has a "ghalat correction" button. Reports are stored with the attempt and listed in A02-lite. [PROPOSED] If more than 5% of shown corrections in a week are reported, the founder reviews the prompt before the next content release.

### 4.6 Level test [PLAN: 3 minutes, anonymous, sign-in after the result; PROPOSED: the prompts]
Three short spoken prompts (introduce yourself; answer one simple interview question; describe your day), each up to 60 seconds, 3 minutes in total. The result shows a Practice Score, 3 corrections and a suggested track.

### 4.7 Content [PLAN]
- Lessons are files with `status: draft | approved`. Only approved lessons are shown.
- Written by the founder (HR professional) from general and public knowledge only, never from employer material.
- Days 1-14 of each track at launch, the rest released weekly.

### 4.8 Spoken instructions [PLAN]
Every screen that asks the user to do something has a play button that reads the instruction in Urdu. [PROPOSED] Fixed instruction audio is generated once (TTS or recorded by the founder) and cached, not generated per user. [VERIFY] which TTS voice sounds natural in Urdu.

### 4.9 Streak and badges [PLAN: Phase 1]
[PROPOSED] A streak is the number of consecutive Pakistan-time calendar days with at least one completed lesson. Badges at 3, 7, 14 and 30 days and on finishing a track. No streak freezes or rewards in Phase 1.

---

## 5. Plans, minutes and caps

### 5.1 Plans [PLAN]
| Plan | Phase | Price (PKR) | Length | Minutes | Payment |
|---|---|---|---|---|---|
| Free | 1 | 0 | n/a | 3-minute level test, 10-minute first lesson (once per phone) | none |
| Sprint 14 | 1 | 499 | 14 days | 140 | manual wallet |
| Pro 30 | 1 | 799 (999 for 30% of new users, as a test) | 30 days | 300 | manual wallet |
| Founding Pro | 1 | 599 first month, first 100 users | 30 days | 300 | manual wallet |
| Weekly | 2 | 299 | 7 days | 70 | auto-pay only |
| Plus | 3 | 1,499 | 30 days | Pro plus live mock calls | gateway |
| Team (B2B) | see 5.4 | 600 per learner per month, minimum 20 | monthly | 120 per learner per month | invoice |

### 5.2 Active time [PROPOSED]
The minutes wallet and the day cap count **active time**: seconds of the learner's recorded answers plus seconds of tutor audio played, measured on the server. Reading the phrase screen does not count. The level test and the first lesson count against the free allowance only.

### 5.3 Caps [PLAN]
- Day cap: 15 minutes of active time for B2C plans; 10 minutes for Team learners.
- Each answer: at most 60 seconds. Each step: at most 2 retries.
- Minutes wallet: a plan stops when its minutes or days run out, whichever comes first.
- All caps are enforced on the server. When a cap is hit, the app says so plainly and shows when it resets or what the user can buy. No hidden overage.

### 5.4 Team pilot [PLAN: terms; PROPOSED: Phase 1 scope]
Terms: 4-week paid pilot for 20 learners at PKR 600 each (PKR 12,000), invoiced at the end or with at most 25% advance; then monthly per active learner; no reseller scheme. [PLAN]

Phase 1 scope, built only after a pilot is signed:
- In A02-lite the admin creates a team and one invite code per learner.
- Learners use the normal screens with Team caps (120 minutes a month, 10 minutes a day).
- Each learner gives their own voice consent (S02). The buyer never hears recordings.
- Weekly report: a CSV export from A02-lite with, per learner, active days, lessons done, first and latest Practice Score. [PLAN: "weekly active days and scores per learner, before/after speaking score"]
- The B2B dashboard is Phase 2.

### 5.5 Price test and Founding Pro [PLAN: 30% see 999; Founding Pro 599 for the first 100; PROPOSED: how they combine]
- At sign-up each user is placed in a price group for Pro 30, and the group is kept: 70% see 799, 30% see 999.
- Founding Pro (599 for the first month) is offered to the first 100 Pro buyers in both groups. From the second month they pay their group's Pro price.
- The S12 view, purchase and renewal events carry the price group, so the 799 vs 999 result can be read.

### 5.6 Renewal and day-28 offer [PLAN: renewal card and day-28 offer on S07; PROPOSED: timing]
- No auto-renewal in Phase 1. A renewal card shows on S07 from 3 days before the plan ends.
- Day-28 offer (Pro 30): from day 28, S07 offers the other track (for example call centre after interview) at the user's Pro price.

### 5.7 Refunds [PLAN: refund promise, refund button on S14; PROPOSED: the policy]
- Full refund if asked within 3 days of approval and no more than 2 lessons have been used. Otherwise the founder decides case by case.
- Refunds go back to the same wallet within 3 working days. Refund money is kept separate from other money. [PLAN]

---

## 6. Screens (Phase 1)

All text comes from `config/strings.json`. Every screen works at 360 px, logs its events (section 11) and has the spoken-instruction button where it asks for an action.

| ID | Screen | Main contents and rules |
|---|---|---|
| **S01** | Welcome | Script choice (Roman Urdu or Urdu script) on this first screen. **In-app browser check before the test:** if the page is open in a Facebook, Instagram or TikTok in-app browser, show how to open it in Chrome (Android intent link plus a copy-link fallback). Trust line "Hum training bechte hain. Hum kabhi naukri nahi bechte." Button for the free level test. No sign-in. [PLAN] |
| **S02** | Consent and microphone | Urdu consent text: what is recorded, that audio is processed by a foreign AI provider, deleted after 30 days, never used to train models, can be deleted any time, no CNIC asked. The consent version and time are stored (against the device for anonymous users) **before** any audio leaves the phone. Then the microphone permission, with help if it is denied. [PLAN] |
| **S03** | Level test | Three spoken prompts, up to 60 seconds each, 3 minutes in total. Anonymous session. Device, IP and global caps and a bot check apply before the first upload (section 10). [PLAN] |
| **S04** | Level test result | Practice Score, 3 corrections in Urdu, suggested track. Button to start the free first lesson, which leads to S05. Unclaimed test audio is deleted after 24 hours. [PLAN] |
| **S05** | Sign in and phone | Sign in with Google [PROPOSED], then phone number with an OTP code [PLAN; VERIFY: OTP provider and cost]. One free first lesson per phone. The anonymous test is linked to the account, which claims its audio. Optional WhatsApp reminder opt-in. [PLAN: sign-in after the result] |
| **S06** | Track and goal | Choose `interview` or `callcenter`. Optional interview date and daily reminder time. [PROPOSED] |
| **S07** | Home | Today's lesson (day N of the track), streak, minutes left today and in the plan, plan and days left. Payment status banner (pending, provisional, rejected). **PWA install prompt** after the first completed lesson, **renewal card**, **day-28 offer**. For free users: the first lesson, then plans. [PLAN] |
| **S08** | Lesson: learn | 3-4 phrases with English text, Urdu meaning and tutor audio. [PLAN] |
| **S09** | Lesson: roleplay | Tutor line (audio and text), record up to 60 seconds, re-record within 2 retries. Uploads retry on a weak network. Shows active minutes left today. [PLAN] |
| **S10** | Lesson: feedback | Practice Score, 3 corrections, play back own answer, "ghalat correction" report button, next turn or finish. [PLAN] |
| **S11** | Progress and Practice Report | Days done, streak, badges, score trend, first and latest Practice Score, the 3 most repeated mistakes. Can be shared as an image [PROPOSED]. Called "Practice Report" only, with no wording that makes it look like an exam or employer result (CLAUDE.md copy rules). [PLAN] |
| **S12** | Plans | Sprint 14, Pro 30 (the user's price group), Founding Pro while places last. What each plan gives, the approval windows in plain words, the refund promise and the trust line. [PLAN] |
| **S13** | Pay by wallet | Business-name account name and number, amount, steps. The user enters the transaction ID (required) and sender name, and can add a screenshot or paste the wallet SMS. Status: pending, provisional, approved, rejected. Rejected payments show the reason, a resubmit button and WhatsApp help. A duplicate transaction ID is refused at submit. [PLAN] |
| **S14** | Account and help | Help and FAQ, WhatsApp support link, **refund request button**, delete my audio, delete my account, script choice, reminder settings, Urdu privacy policy, sign out. [PLAN] |

### Admin screens (routes check `ADMIN_EMAILS`, usable on a phone) [PLAN]

| ID | Screen | Main contents and rules |
|---|---|---|
| **A01** | Payment approvals | Queue of submitted payments grouped by approval window. **SMS-paste matcher:** the admin pastes wallet SMS texts, and the app reads amount, transaction ID and sender and matches them to pending payments [VERIFY: real SMS formats]. **Batch approve**, reject with a reason, duplicate transaction IDs flagged, provisional users listed. Today's approval count, with an alert above 15 a day. |
| **A02-lite** | Support | User lookup by email or the last 4 digits of the phone (the phone is shown masked), extend or revoke a plan, mark a refund paid with the wallet reference, support requests from S14, wrong-correction reports, Team learners and the weekly CSV export (section 5.4). |

---

## 7. Lesson pipeline (server)

1. The browser records Opus/WebM audio, at most 60 seconds, and uploads it to a private Supabase Storage bucket. [PROPOSED: format]
2. The server checks: signed in or a capped anonymous session, consent version stored, plan active, day cap and minutes left, retries left, rate limits. Any failure stops the call before a provider is used. [PLAN]
3. Speech-to-text through `/lib/stt`, then feedback through `/lib/llm` with the versioned prompt, which returns JSON: score parts, Practice Score, 3 corrections and clarity_beta. [PLAN: interfaces; PROPOSED: JSON shape]
4. The attempt is saved with transcript, score, corrections, clarity_beta, prompt version, provider names, `provider_cost_usd` and `cost_pkr` (via `FX_PKR_PER_USD`), and active seconds used. [PLAN]
5. Tutor audio for fixed lesson lines is generated once per lesson version and cached. [PROPOSED]

---

## 8. Payments (Phase 1)

**States:** `pending` → `provisional` → `approved` or `rejected`; later `refunded`. [PLAN: provisional access, rejected flow, refund]

**Approval windows [PROPOSED]:** every day at 08:00-08:30, 13:00-13:30 and 21:00-22:30 Pakistan time. S12 and S13 say in plain words that a payment is approved in the next window. These are the honest windows the Business Plan asks for. [PLAN]

**Provisional access [PROPOSED]:** after a user submits a well-formed, unused transaction ID, they can use the plan for up to 24 hours or 15 active minutes, whichever comes first, until the payment is approved. If rejected, access stops and a message gives the reason.

**Screenshots [PROPOSED]:** stored in a private bucket, deleted 90 days after the decision, never logged.

**Tests before the first paid user [PLAN]:** a real PKR 499 payment, a rejected payment, a refund and a duplicate transaction ID.

**Phase 2 [PLAN]:** a payment gateway with auto-pay [VERIFY: gateway eligibility for a sole proprietor].

---

## 9. Privacy, consent and data [PLAN unless marked]

- Consent text in Urdu, with a version. It is stored before any audio reaches an AI provider, including the anonymous test. If the version changes, users consent again before their next recording.
- Users are told that audio is processed by a foreign AI provider.
- Audio: private storage, deleted after 30 days; unclaimed anonymous audio deleted after 24 hours; the user can delete all their audio at any time from S14, which deletes it at once.
- Audio and transcripts are never used to train models.
- No CNIC. The phone number is stored only for OTP and WhatsApp, never logged, and masked in admin screens.
- [PROPOSED] Transcripts and scores are kept while the account exists (they are needed for progress, and for "My Mistakes" in Phase 2) and deleted with the account.
- [PROPOSED] Account deletion completes within 7 days.
- No enacted data-protection law was found (snippet only); these rules apply anyway.

---

## 10. Free-usage controls [PLAN: the controls; PROPOSED: the numbers]

| Control | Starting value |
|---|---|
| Anonymous level tests per device per day | 1 |
| Anonymous level tests per IP per day | 10 (mobile networks share IPs, so this stays loose) |
| Anonymous level tests in total per day | 150 |
| Free first lessons in total per day | 40 [PLAN] |
| Free first lesson | once per OTP-checked phone [PLAN] |
| Bot check | before the first upload of the level test [PLAN; VERIFY: a free bot-check service] |
| Daily free-AI budget breaker | PKR 1,500 a day. When it trips, the free test and free lesson show "aaj ki free jagah khatam, kal aayen" with a WhatsApp waitlist link. Paying users are not affected. |
| Rate limits | 30 requests a minute per user; 6 AI calls a minute per user |

At the starting values, free usage costs at most about PKR 1,300 a day (150 tests x 3 minutes plus 40 lessons x 10 minutes, at PKR 1.5 a minute), under the breaker.

---

## 11. Events and metrics

**Rules:** events go to a server-side `events` table (name, user ID or anonymous ID, time, properties). Properties never contain audio, transcripts, phone numbers or screenshots. Day-based metrics use Pakistan time. [PLAN: log events; PROPOSED: the list]

| Event | When | Main properties |
|---|---|---|
| `landing_view` | S01 opens | source (UTM), script |
| `inapp_browser_detected` | S01 detects an in-app browser | app (facebook, instagram, tiktok, other) |
| `open_in_chrome_clicked` | user taps the Chrome link | |
| `consent_given` | S02 consent stored | consent_version |
| `mic_denied` | microphone permission refused | |
| `level_test_start` / `level_test_complete` | S03 | duration_s |
| `level_test_result_view` | S04 | score_band, suggested_track |
| `signup_complete` | S05 Google sign-in done | price_group |
| `otp_sent` / `otp_confirmed` | S05 | |
| `track_selected` | S06 | track |
| `first_lesson_start` / `first_lesson_complete` | free lesson | |
| `lesson_start` / `lesson_complete` | S08-S10 | track, day, score |
| `answer_submitted` | S09 upload accepted | step, retry_no, answer_s |
| `feedback_shown` | S10 | score, prompt_version |
| `wrong_correction_reported` | S10 | step |
| `cap_reached` | any cap hit | cap (day, minutes, retries, free_budget, rate) |
| `streak_updated` / `badge_earned` | after a lesson | streak_days, badge |
| `paywall_view` | S12 | price_group, founding_available |
| `plan_selected` | S12 | plan, price_pkr |
| `payment_submitted` | S13 | plan, price_pkr, has_screenshot, has_sms |
| `payment_provisional` / `payment_approved` / `payment_rejected` | A01 or system | plan, reason (rejected), minutes_to_decision |
| `refund_requested` / `refund_paid` | S14 / A02-lite | plan |
| `renewal_card_view` / `day28_offer_view` | S07 | plan |
| `pwa_install_prompt` / `pwa_installed` | S07 | |
| `help_opened` / `support_request` | S14 | topic |
| `audio_deleted_by_user` / `account_deleted` | S14 | |
| `free_budget_breaker_tripped` | system | budget_pkr |
| `ai_call` | every provider call | kind (stt, llm, tts), provider, provider_cost_usd, cost_pkr |

**Metric definitions [PROPOSED, matching the Business Plan gates]:**
- **Payer:** a user with at least one approved paid plan. G1 counts cumulative unique payers.
- **Day-7 retention:** of the users who completed their first lesson, the share who complete a lesson on the 7th day after that day.
- **AI cost per payer:** all AI cost in PKR (free users included) divided by cumulative payers. Alert above PKR 350. [PLAN: the 350 limit]
- **Day-31 renewal:** share of Pro 30 users who buy again within 3 days of the plan ending. Early warning under 45%. [PLAN: the 45% warning]
- **Approvals per day:** from A01. Alert above 15. [PLAN]
- **Contribution / CAC:** computed outside the app from these events and ad spend. [PLAN: G2]

---

## 12. Data model (Supabase) [PLAN: RLS on every user table; PROPOSED: the tables]

Row-level security on every user table: a user reads and writes only their own rows; admin access goes through server routes that check `ADMIN_EMAILS`.

| Table | Purpose |
|---|---|
| `profiles` | user ID, script, track, interview date, reminder time, price group, WhatsApp opt-in, phone (stored for OTP and WhatsApp only), team ID |
| `anon_sessions` | anonymous ID, device hash, IP hash, created, claimed by user ID |
| `consents` | user ID or anonymous ID, consent version, time |
| `entitlements` | user ID, plan, price paid, start, end, minutes total, active seconds used, status |
| `payments` | user ID, plan, amount, transaction ID (unique), sender name, screenshot path, SMS text, status, window, decided by, reason, decided at |
| `refunds` | payment ID, amount, wallet reference, paid at |
| `lessons` | track, day, version, status (draft or approved), content JSON, released at |
| `lesson_runs` | user ID, lesson ID, started, completed, score |
| `attempts` | run ID, step, retry number, audio path, transcript, score parts, Practice Score, corrections JSON, clarity_beta, prompt version, providers, provider_cost_usd, cost_pkr, active seconds |
| `correction_reports` | attempt ID, correction index, note |
| `streaks`, `badges` | per user |
| `support_requests` | user ID, topic, message, status |
| `teams`, `team_invites` | team name, buyer contact, invite codes, learner links |
| `events` | section 11 |
| `daily_counters` | date, free tests used, free lessons used, free AI cost in PKR (for the breaker) |

---

## 13. Providers and cost

- Provider code stays behind the `/lib` interfaces already built in P0-1, chosen by env name. [PLAN]
- **Candidates for the P0-2 voice test [PROPOSED; VERIFY: current price, Urdu support and data terms; the founder picks one or two under CLAUDE.md rule 9]:**
  - Speech-to-text: OpenAI, Deepgram, Google Cloud Speech-to-Text, Azure Speech.
  - LLM for feedback: a small, fast model from Anthropic, OpenAI or Google.
  - TTS for tutor lines and spoken instructions: Google Cloud TTS, Azure, OpenAI, or audio recorded by the founder.
- Prefer providers that do not train on API data and that allow a spend limit. [PLAN: no training; spend limits before the first paid user]
- Every AI call logs `provider_cost_usd` and `cost_pkr`. [PLAN]
- Pronunciation scoring is a Phase 3 spike only. [PLAN]

---

## 14. Non-functional requirements and testing

- **Phone and network [PLAN]:** tested on a real low-end Android phone at 360 px on throttled 3G.
- **Budgets [PROPOSED]:** lesson screens load at most about 250 KB of compressed JavaScript; audio is Opus/WebM at about 16-24 kbps (a 60-second answer is about 150 KB); feedback appears within 8 seconds on 4G and 15 seconds on 3G at the median.
- **Browsers [PROPOSED]:** Android Chrome and Samsung Internet (recent versions) fully supported; iOS Safari best effort.
- **Language:** Urdu script screens are right-to-left. Large tap targets. Spoken instructions on action screens. [PLAN: spoken instructions]
- **Before the first paid user [PLAN]:** Pro database plan live, provider spend limits and auto-recharge on, uptime alert working, a 50-user load test, the four payment tests in section 8.
- **Logging [PLAN]:** never log audio, transcripts, phone numbers or payment screenshots, to the console or the error tracker.

---

## 15. Phase 1 build order [PROPOSED]

One screen or one pipeline step per session (CLAUDE.md rule 1):
1. S01 Welcome (script choice, in-app browser check)
2. S02 Consent and microphone
3. Lesson pipeline step: upload, checks, STT, feedback, attempt saving (section 7)
4. S03 Level test (with free controls and bot check)
5. S04 Level test result
6. S05 Sign in and phone
7. S06 Track and goal
8. S07 Home (without renewal card and offer yet)
9. S08 Lesson: learn
10. S09 Lesson: roleplay
11. S10 Lesson: feedback
12. S12 Plans
13. S13 Pay by wallet
14. A01 Payment approvals
15. S07 additions: renewal card, day-28 offer, PWA install prompt
16. S11 Progress and Practice Report
17. S14 Account and help
18. A02-lite Support
19. Daily free-AI budget breaker and rate-limit hardening
20. Events check against section 11, load test, pre-launch checks
21. Team pilot pieces (section 5.4), only once a pilot is signed

---

## 16. Config starting values

These fill the values that are still `null` in the repo's config. Keys are as they are in the repo today.

**`config/app.json`**
| Key | Value | Source |
|---|---|---|
| `limits.anonymous_test.per_device_per_day` | 1 | section 10 [PROPOSED] |
| `limits.anonymous_test.per_ip_per_day` | 10 | section 10 [PROPOSED] |
| `limits.anonymous_test.global_per_day` | 150 | section 10 [PROPOSED] |
| `limits.rate_limit_requests_per_minute` | 30 (add `limits.ai_calls_per_minute`: 6) | section 10 [PROPOSED] |
| `limits.daily_free_ai_budget_pkr` | 1500 | section 10 [PROPOSED] |
| `consent.version` | `"ur-v1-2026-11"` | section 9 [PROPOSED] |
| `payments.approval_window` | Replace with a list `payments.approval_windows`: 08:00-08:30, 13:00-13:30, 21:00-22:30 (Pakistan time); a payment is decided in the next window | section 8 [PROPOSED] |

**`config/plans.json`**
| Key | Value | Source |
|---|---|---|
| `team.phase` | 1 (pilot pieces only, built once a pilot is signed; dashboard in Phase 2) | section 5.4 [PROPOSED] |
| `founding_pro.renewal_price_pkr` | Renews at the user's Pro 30 price group (799, or 999 in the test group) | section 5.5 [PROPOSED] |
| `day_cap_minutes` on `sprint_14`, `pro_30`, `founding_pro`, `weekly_299` | 15 (the global B2C cap) | section 5.3 [PLAN] |
| `day_cap_minutes` on `free` | stays null: the free plan uses `free_allowance` | section 5.1 |
| `free.duration_days`, `free.minutes` | stay null: not used | section 5.1 |
| `plus_1499.payment_mode`, `duration_days`, `minutes`, `day_cap_minutes` | `gateway_autopay`, 30, 300, 15; Phase 3, may change when Plus is designed | section 5.1 [PROPOSED] |

---

## 17. Open items to verify

| Item | Needed by |
|---|---|
| OTP provider and cost per SMS | S05 |
| A free bot-check service | S03 |
| Real wallet SMS formats for the matcher | A01 |
| Business-name wallet account and NTN | S13, soft launch |
| Speech-to-text, LLM and TTS choice, price and data terms | P0-2 |
| Urdu TTS voice quality, or founder-recorded audio | S08, spoken instructions |
| Gateway eligibility for a sole proprietor | Phase 2 |
| WhatsApp Business API cost (Phase 1 uses wa.me links and manual sends from the WhatsApp Business app) | Phase 2 |
| Employment contract and written employer consent | G0 |
| Written BEOE opinion | Phase 3 Gulf track |
| Meta ad rules for the landing page and ads | soft launch |
| Pronunciation provider tested on Pakistani accents | Phase 3 |
