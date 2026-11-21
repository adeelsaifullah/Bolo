# Business Plan v2: Bolo, Urdu-first AI English speaking coach (Pakistan)

Version v2.1 (Board-revised, QA-checked) · 2026-11-20 · replaces Business Plan v1. Product detail is in PRD.md; the reason for every change is in DECISIONS.md.

Tags: \[sourced\] = a source exists (most web sources were snippet-only, pages not opened); \[estimate\] = planning number; \[simulated\] = an AI panel answer, an upper bound, not customer data.

## 1. Executive summary

Bolo is a mobile web app (PWA) where Pakistani job seekers practise job-focused spoken English for about 10 minutes a day with an AI tutor that explains mistakes in Urdu. It is the SpeakX playbook rebuilt for Pakistan: same daily speaking loop, but a different customer, price, payment path and trust model.

What the Board changed after testing v1 (3 Board reviews and a 17-person simulated panel):

- **Customer:** start with urban call-centre applicants and fresh graduates, not Gulf blue-collar workers. Simulated paid-plan intent was 3 of 6 urban vs 0 of 6 Gulf \[simulated\].

- **Price:** PKR 1,499 a month is too high for most users (3.7% of a PKR 40,000 minimum wage \[sourced snippet\]; 8 of 12 simulated users called it too expensive). New ladder: free first lesson, 14-day Sprint PKR 499, 30-day Pro PKR 799 (test 999).

- **Payments:** manual wallet approval cannot run on a 9-5 job at scale, so it is timed, batched and replaced by a gateway in Phase 2.

- **Economics:** v1's "PKR 38 lakh in year 1 from ads" does not survive realistic churn and AI cost. Paid ads stay off until contribution per payer is at least twice CAC. Growth comes from organic, referral and B2B call-centre pilots.

- **Honest outlook (base case):** month-12 income about PKR 1.7 lakh a month and about PKR 0.3 lakh net profit a month; the 12-month total is still about PKR 1.9 lakh negative and the first positive month is 11. Founder cash at risk is about PKR 2.6 lakh in the worst case, spent in gated steps (about PKR 0.9 lakh by the first gate). Only the high case is profitable within 12 months. It does not reach PKR 5 lakh a month in year 1.

## 2. Problem and customer

- Spoken English decides many interviews. Graduate unemployment aged 20-24 is 32.8% \[sourced: Gallup Pakistan LFS 2024-25, as quoted in v1\]. Human help is costly: short courses list at PKR 8,000-20,000 \[sourced snippet\], so a PKR 799 month is far cheaper than a class, but the honest competitor is free.

- The real competitors are free: YouTube Urdu English lessons (named by 8 of 12 simulated users), ChatGPT voice, Duolingo, TikTok. Telecom-billed language learning exists at Rs 5 a day \[sourced snippet: Zong Busuu\].

- **What made simulated users pay:** a result they can see (interview calls), job-specific roleplay (call-centre scripts, hotel phrases, client calls), pronunciation feedback an employer would accept, measurable progress. Generic English is not enough \[simulated\].

- **First customer:** urban Android users 20-30, wallet users, preparing for call-centre or general interviews. Second: B2B call-centre training teams. Later: Gulf-bound workers through training institutes, after a BEOE opinion.

## 3. SpeakX playbook for Pakistan

| **SpeakX**                                                                                | **Pakistan version**                                                                                                                         |
|-------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| About 200,000 payers, USD 7.5M ARR, INR 299/month \[sourced: v1 citing YourStory, Inc42\] | Realised value is only about PKR 875 per payer per month \[estimate: 7.5M / 200k / 12 x PKR 280\], so India proves the format, not our price |
| Hindi audience, UPI payments                                                              | Urdu/Roman Urdu, wallet transfers now, gateway later                                                                                         |
| Subscription                                                                              | Goal-based 14-day and 30-day packs (the goal ends, so endless subscription churns)                                                           |
| Brand                                                                                     | Free level test, free first lesson, founder's face, no job promises                                                                          |
| Content                                                                                   | Interview and call-centre scripts written by an HR professional                                                                              |

## 4. Product summary

Daily loop of 10 minutes: learn 3-4 phrases, roleplay 4-6 turns, feedback with a 0-100 score and 3 corrections explained in Urdu. Phase 1 has two 30-day tracks (interview, call centre), a streak, a "My Mistakes" replay (Phase 2) and a Practice Report. No pronunciation score until a provider is validated, and no "Verified" certificate. See PRD.md.

## 5. Pricing and packaging (PKR)

| **Plan**       | **Price**                                           | **What it gives**                                                                       | **Why**                                                                                    |
|----------------|-----------------------------------------------------|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Free           | 0                                                   | 3-minute level test, 10-minute first lesson (once per phone)                            | Trust before payment; replaces the PKR 10 trial                                            |
| Sprint 14 days | 499                                                 | 140 minutes                                                                             | Fewer approvals than weekly; matches the pilot price; goal-based                           |
| Pro 30 days    | 799 (test 999 on 30% of new users)                  | 300 minutes, full 30-day track                                                          | Median "getting expensive" point was PKR 800, "too expensive" 1,100 \[simulated\]          |
| Founding Pro   | 599 first month, first 100 users                    | Same as Pro                                                                             | Replaces the 3-month upfront pre-sale: 0 of 12 simulated users would pay PKR 3,999 upfront |
| Weekly 299     | Phase 2, auto-pay only                              | 70 minutes                                                                              | Telecom-style small packs, but weekly manual approvals are too heavy                       |
| Plus 1,499     | Phase 3                                             | Pro plus live mock calls                                                                | The only use for the old price                                                             |
| Team (B2B)     | 600 per learner per month, minimum 20, 4-week pilot | Learner accounts with 120 minutes a month each, weekly team report, before/after scores | Buyers accepted PKR 500-800 (median 600) \[simulated\]                                     |

Simulated price test (n=12, PKR per month): too cheap 200, bargain 400, getting expensive 800, too expensive 1,100 (medians). At 1,499, 8 of 12 call it too expensive; at 999, 4 of 12; at 799, 3 of 12 \[simulated\]. These users anchor on the price they are shown, so the 799 vs 999 experiment decides.

## 6. B2B: Bolo for Teams

- **Buyers:** call-centre training managers first (one simulated buyer would take 40 seats at PKR 800 billed monthly in arrears). Colleges and institutes want accredited certificates and references; do that after a call-centre case study. Recruiting agencies are excluded until the employer conflict is cleared (see section 11).

- **Terms:** 4-week paid pilot for 20 learners at PKR 600 (PKR 12,000), invoiced at the end or with at most 25% advance; then monthly per active learner. Each learner has a 120-minute monthly cap so AI cost stays below the price. 5 of 5 simulated buyers rejected a 50% advance; 0 of 5 would sign the v1 terms.

- **Proof pack (what they asked for):** weekly active days and scores per learner, before/after speaking score, optional control group, and a consent process for voice recordings.

- **No reseller scheme in v1:** 4 of 5 simulated buyers rejected it.

## 7. Go-to-market (organic and B2B first)

1.  **Phase 0 pilot:** 20 users x PKR 499 for 14 days over WhatsApp, run by the founder with Claude chat. Pass rule in PRD section 2 (G0). Gives real testimonials with permission.

2.  **Soft launch (start of month 5):** pilot users, waitlist, one or two call-centre pilots. Founder content 3 posts a week (TikTok, Reels, Shorts) and replies to inbound: about 20-30 minutes a day \[estimate\]. Referral (Phase 2): both get 3 free days after the friend pays.

3.  **Paid ads:** a PKR 30,000 a month test from month 6 only to measure CAC. Pakistan clicks are cheap (about PKR 5-30 \[sourced snippet\]) but the funnel decides: CAC is PKR 1,200 only at 2.5% click-to-payer, about PKR 3,000 at 1% \[estimate\]. Scale ads only when contribution per payer divided by CAC is at least 2 (about PKR 320 today).

4.  **Trust stack:** founder's real name and face, free test and free first lesson, honest approval windows, refund promise, business-name payment account \[verify\], privacy policy in Urdu, and the line "We sell training. We never sell jobs."

## 8. Competition and positioning

Free tools (YouTube, ChatGPT voice, Duolingo, TikTok); local competitors with unknown prices (Maqsad, Asan English); global AI tutors in dollars (Speak at USD 39.99 for the top tier, as quoted in v1); Indian AI tutors; human tutors and academies. Positioning: for job seekers who freeze when speaking English, a daily Urdu-explained practice that prepares them for their exact interview. Defence: HR-written job content, B2B proof data, local payments. A copycat can match features, so speed to B2B proof matters.

## 9. Unit economics (honest)

Per NEW B2C payer, base mix 60% Sprint and 40% Pro \[estimate\]:

| **Line**                                                                                                              | **PKR** |
|-----------------------------------------------------------------------------------------------------------------------|---------|
| Revenue over the payer's life (Sprint 998, Pro 1,940; Pro lifetime 2.43 months: 50% churn at first renewal, then 35%) | 1,375   |
| Fees, refunds, tax reserve (12%)                                                                                      | -165    |
| AI usage (PKR 1.5 per active minute, 40% of cap used)                                                                 | -276    |
| AI and OTP cost of free users per payer (anonymous tests, first lesson, phone check; 10% of sign-ups pay)             | -292    |
| **Contribution**                                                                                                      | **642** |

- Maximum CAC for contribution/CAC of 2: about PKR 320. At CAC 2,000 the ratio is 0.32; at 1,200 it is 0.53. v1 assumed 2.3x; the difference comes from the lower price, shorter life and free-usage cost.

- Worst-case margins if the minutes cap is fully used: Pro 799 - 450 AI - 96 = 253 (32%); Sprint 499 - 210 - 60 = 229 (46%). The cap must stay.

- B2B learner per month: 600 - 180 AI (120-minute cap) - 12 = about 408 (68%).

- Levers: Pro life from 2.4 to 4 months (+60% Pro revenue); Pro at 999; B2B learners; referral; cheaper or cached AI; a 30-day-end offer on the next track.

- To reach PKR 5 lakh a month you need about 410 new B2C payers every month, or about 830 B2B learners, or a mix. That is about 2.9 times the base case's month-12 income.

## 10. Financial scenarios (12 months, PKR) \[estimate\]

| **Scenario** | **12-month income** | **12-month cost** | **Result** | **Lowest cumulative cash** | **First positive month** | **Month-12 income** | **Month-12 net** |
|--------------|---------------------|-------------------|------------|----------------------------|--------------------------|---------------------|------------------|
| Low          | 2.50 lakh           | 5.05 lakh         | -2.55 lakh | -2.62 lakh (month 10)      | 11                       | 0.52 lakh           | +0.05 lakh       |
| Base         | 7.44 lakh           | 9.39 lakh         | -1.95 lakh | -2.41 lakh (month 10)      | 11                       | 1.70 lakh           | +0.28 lakh       |
| High         | 12.72 lakh          | 11.85 lakh        | +0.87 lakh | -1.80 lakh (month 6)       | 7                        | 2.90 lakh           | +0.93 lakh       |

Income is after fees, refunds and tax reserve. Base monthly income: M5 0.14, M6 0.41, M7 0.45, M8 0.85, M9 1.03, M10 1.20, M11 1.56, M12 1.70 lakh. In the low case the G1 stop rule fires at the end of month 6, which would cap the loss near PKR 2.0 lakh.

**Assumptions:** soft launch at the start of month 5; new B2C payers per month M5-M12 base 20, 35, 50, 65, 80, 95, 110, 120 (low x0.4, high x1.7) from organic, referral, pilots and test ads; 60% Sprint (50% renew each 14 days) and 40% Pro; free usage costs PKR 292 per payer; B2B: PKR 12,000 pilot in month 6, then base 40 learners from month 8 and 30 more from month 11 at PKR 600 (high: three accounts of 40 from months 7, 9 and 11; low: none); one-time PKR 80,000 (legal, accountant, voice test, branding); pilot ads PKR 15,000 in months 1 and 2; tools PKR 21,000 a month from month 3; test ads PKR 30,000 a month from month 6 (low case stops after month 7); part-time approver PKR 15,000 a month from month 9 in base and high; pilot cash PKR 9,980 in month 1; founder time unpaid.

**Cash:** about PKR 0.9 lakh is spent to pass G0 (month 1), about PKR 1.5 lakh by launch (start of month 5), about PKR 1.9 lakh by G1 (end of month 6, base), and the base case bottoms at about PKR 2.4 lakh in month 10; the low case without a stop would reach PKR 2.6 lakh. v1 said PKR 31,000 because it counted PKR 2.1 lakh of upfront pre-sales that the panel would not pay. Plan the founder's cash as PKR 2.6 lakh, released in gates.

## 11. Founder time and conflict-of-interest safeguards

- About 2 hours a day, about 14 hours a week. Phase 1 needs about 110-130 build and test hours plus about 25 content-review hours \[estimate; the v1 scope was about 190 hours per the Board review, of which about 143 were build and test\]. During the build the split is build 70%, content 15%, pilot support and approvals 10%, other 5% (about 9.8 build hours a week), so Phase 1 takes about 12-14 weeks. After launch: build and test 40%, content 15%, support and approvals 15%, marketing and B2B 30%.

- **Employer:** the founder works at a staffing contractor. Before any outside work: read the employment contract (side work, competition); get written consent; do not pitch the employer's clients or recruiting agencies; write the HR question bank only from general and public knowledge, never from employer material.

- **Full-time trigger (kept from v1):** leave the job only when monthly profit is at least 1.5 times the salary for 3 months in a row. The base case does not reach this in year 1.

## 12. Milestones and stop rules

| **When**            | **Milestone**                                                          | **Gate**                                                                                                                                                                   |
|---------------------|------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Weeks 0-4 (month 1) | Phase 0: voice test, WhatsApp pilot, legal and payment-account checks  | G0 (PRD section 2)                                                                                                                                                         |
| Months 2-4          | Phase 1 build (about 12-14 weeks); soft launch at the start of month 5 | Pass G0 first                                                                                                                                                              |
| Month 6             | First B2B pilot; test ads start                                        | CAC measured                                                                                                                                                               |
| End of month 6      | 60 days after soft launch                                              | G1: at least 45 cumulative unique payers, day-7 retention 25%, AI cost at most PKR 350 per payer. Stop rule: under 45 payers or day-7 under 20% stops ads and new building |
| Months 7-11         | Phase 2 (retention, gateway, B2B dashboard; about 12-16 weeks)         | G2: contribution/CAC at least 2 before scaling ads                                                                                                                         |
| Month 12            | Review against the scenarios                                           | Decide: scale, hold or stop                                                                                                                                                |

## 13. Risks and legal flags (not legal advice)

| **Risk**                              | **Early warning**                                                          | **Response**                                                                                                                |
|---------------------------------------|----------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| Users leave after the 30-day goal     | Day-31 renewal under 45%                                                   | Next-track offer, weekly mock, My Mistakes, B2B cohorts                                                                     |
| CAC too high                          | Contribution/CAC under 2                                                   | Ads off; referral and B2B                                                                                                   |
| Manual approvals overload the founder | Over 15 approvals a day                                                    | Gateway or part-time approver                                                                                               |
| Wrong or unfair feedback              | Wrong-correction reports; voice test below target                          | Switch provider; "report wrong correction"; hide beta scores                                                                |
| BEOE / overseas-employment rules      | "Gulf job" wording; "Verified" certificate                                 | No Gulf wording in Phase 1; Practice Score; written BEOE opinion before Phase 3 \[Emigration Ordinance 1979, snippet only\] |
| Voice data                            | No enacted data-protection law found \[snippet\]; audio goes to foreign AI | Urdu consent, 30-day deletion, no training, no CNIC                                                                         |
| Payment account and tax               | Personal wallet used for business; no NTN                                  | Business-name account, NTN, accountant \[verify\]; refund money kept separate                                               |
| AI cost or rupee moves                | AI cost per payer above PKR 350                                            | Caps, caching, quarterly price review                                                                                       |
| Platform rules (ads, Play Billing)    | Ad rejection                                                               | No job promises; web payments first; Play Billing for in-app sales                                                          |
| Competitors                           | A free Urdu feature from ChatGPT or a local app                            | B2B proof, HR content, local payments                                                                                       |

## 14. Decisions requested and what to verify first

Approve: P0 only (spend about PKR 0.9 lakh including legal and pilot ads), then P1 after G0; the price ladder and the 799 vs 999 test; B2B terms; stop rules. Verify first: employment contract and written employer consent; written BEOE opinion; business payment account, NTN and a PKR 499 test payment; the 40-recording voice test; Meta ad rules; real AI cost per minute.

## 15. Evidence log

Board reviews: founder/bolo-review/b1-market-pricing.md, b2-product-ops.md, b3-cfo-risk.md. Simulated panel: panel-1.md (6 Gulf/govt users), panel-2.md (6 urban users), panel-3.md (5 B2B buyers); results counted in report.md. Independent QA: founder/bolo-v2/qa.md (its fixes are applied in v2.1). Financial model: inputs listed in section 10, computed by cohort (12 months). All web sources were snippet-only; the panel is simulated and agreeable, so treat results as direction, to be confirmed by the Phase 0 pilot.
