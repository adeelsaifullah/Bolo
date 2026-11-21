# Voice test (P0-2)

Tests speech-to-text and the feedback model on your 40 real recordings, and measures what the AI really costs per minute. It answers G0 items 4 and 5 (PRD section 2). **Run it on your own laptop.** The recordings are private audio: they never go to GitHub, to chat, or to a cloud session.

Everything you put in `voice-test/recordings/` and everything the test writes to `voice-test/results/` is git-ignored. `results.csv` contains transcripts, so treat it like the recordings.

## 1. One-time setup

1. Check `node --version` shows 22 or higher.
2. `npm ci`
3. `cp .env.example .env.local`, then open `.env.local` and fill in:
   - `FX_PKR_PER_USD` with today's rate (280 is only the planning rate).
   - The key for each provider you will use: `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`. Keys go only in this file.
4. In each provider's dashboard, set a monthly **spend limit of about USD 5**. The whole test should cost well under USD 2.
5. **Gemini only:** the key must come from a Google Cloud project with **billing switched on**. Google keeps content out of its product training only for paid usage.

## 2. Prepare the recordings

Put these in `voice-test/recordings/`:

- The audio: `.wav`, `.mp3`, `.m4a`, `.ogg`, `.opus` (WhatsApp voice notes) or `.webm`. Other formats (`.amr`, `.3gp`, `.aac`) are refused with a message; convert them first.
- **`consent.csv`**: one row per recording.

  ```csv
  file,consent_version,date
  ayesha_intro.opus,pilot-v1,2026-11-20
  ```

  A recording with no row, or an empty `consent_version`, is **refused and never sent** to any provider.

- **`reference.csv`**: what each speaker actually said, and who they are.

  ```csv
  file,speaker,speaker_group,reference_transcript,prompt
  ayesha_intro.opus,ayesha,female-karachi,"hello my name is ayesha i have two year experience",Introduce yourself
  ```

  - `speaker` is one person (the test needs at least 15 different speakers).
  - `speaker_group` is any label you choose, for example `female-karachi` or `male-lahore-beginner`. The 25% limit applies to each group on its own. Keep groups big enough (at least 3 recordings), or they say "few recordings".
  - `prompt` (optional) is the question the speaker was asked, word for word. Without it the model is told the question was not recorded, and scores are less reliable.
  - **Write the transcript verbatim: exactly what was said, mistakes included** ("two year", not "two years"). Some speech-to-text tidies grammar, and the test cannot measure that if the reference is tidied too.
  - Punctuation, capital letters and "um/uh" do not matter. Write numbers as digits or words, either is fine up to 999; write longer numbers as the words you heard.

## 3. Run it

Check your files first. This sends nothing and needs no keys:

```bash
npm run voice-test -- --dry-run
```

Fix anything it complains about. It also shows each file's length, which confirms your audio format can be read.

Try three recordings with the first combination (Deepgram for speech, OpenAI for feedback):

```bash
npm run voice-test -- --stt deepgram --llm openai --limit 3
```

If those three look right, run all of them. Saved results are reused, so the first three are not paid for again:

```bash
npm run voice-test -- --stt deepgram --llm openai
```

Then the second combination (OpenAI for speech, Gemini for feedback):

```bash
npm run voice-test -- --stt openai --llm gemini
```

Any pairing works, for example `--stt openai --llm openai`. Switching a provider is only this one option (or `STT_PROVIDER` / `LLM_PROVIDER` in `.env.local`); there is no code to change.

Other options: `--script urdu` (Urdu script instead of Roman Urdu; costs more), `--fresh` (ignore saved results), `--dir <folder>`. `--help` lists them.

The run stops by itself if a provider refuses your key, or if three recordings in a row fail, so a wrong setting cannot run up 40 failures. Finished recordings are kept, so fix the cause and run the same command again.

## 4. Mark the corrections

Open `voice-test/results/<combination>/corrections_review.csv` in Excel or Sheets. For every row, write **right** or **wrong** (or **sahi** / **ghalat**) in the `verdict` column.

- **right**: the learner really said that, the better version is correct English, and the Urdu explanation is correct and clear.
- **wrong**: it misquotes the learner, invents a mistake, gives a wrong fix, or the explanation is wrong or confusing.

You only need to mark the combination you would actually use. Save the file (keep it as CSV), then run the same command again. It sends nothing and costs nothing: it just re-reads your marks. If you re-run with `--fresh` and a correction changes, its old mark is cleared and the summary tells you.

## 5. Read the result

`voice-test/results/<combination>/summary.md` has accuracy by speaker group, correction quality, cost per minute, speed, failed files, and ends with **pass or fail for G0 items 4 and 5**. A verdict of **PENDING** means something is still missing (usually unmarked corrections). `voice-test/results/comparison.md` puts every combination you have run side by side.

The test uses `prompts/tutor-feedback.md`, the same feedback prompt the app will ship, so these numbers describe what users will really get. The results folder name ends with the prompt version (for example `prompt-tutor-feedback.v1`). If the prompt is ever changed and its version raised, the next run starts a new folder: results made with the old prompt stay where they are, and your marks on them are not touched.

Files in the folder: `results.csv` (one row per recording, with transcripts), `corrections_review.csv` (your marks), `summary.md`, `summary.json`, and `files/` (saved per-recording results that make re-runs free).

## 6. Check the money

The costs use the unit prices written at the top of each adapter file in `lib/stt` and `lib/llm`, and `summary.md` prints the prices it used. They are tagged **[VERIFY]**: they were read from search results, not confirmed on the providers' own pages, and **Deepgram's price with training opt-out (`mip_opt_out=true`, which Bolo always sends) is not confirmed.** After a full run:

1. Open each provider's usage or billing page and note what it charged for this run (dashboards can take a few minutes to catch up).
2. Compare it with "this set cost USD ..." in `summary.md`.
3. If they differ, set the matching price variable in `.env.local` (names are in `.env.example`) and run the same command again. The saved results are re-priced at the new price: nothing is sent, nothing is billed, and your marks are kept.

Cost here is per minute of **recorded audio**. G0 item 5 is per active minute, which also includes tutor audio that is made once and cached, so the real figure is a bit lower than this test shows.

## If something goes wrong

| What you see | What to do |
|---|---|
| `... is missing from "voice-test/recordings"` | Create that CSV file with the columns shown above. |
| `REFUSED x: no row in consent.csv` | Add the row. The file was not sent. |
| `Environment variable DEEPGRAM_API_KEY is missing` | Put the key in `.env.local`. |
| `request failed (HTTP 401)` | The key is wrong or has no credit. Fix it in `.env.local`. |
| `request failed (HTTP 404/400)` with a model name | The default model name is out of date. Set the model variable (for example `OPENAI_STT_MODEL`) and run again. |
| Gemini: HTTP 400 mentioning `thinking` | Set `GEMINI_THINKING_LEVEL=` (empty) in `.env.local` to send no thinking setting. |
| `could not read the length of this audio file` | The file may be damaged, or an unusual format. Convert it to `.wav` or `.m4a`. |
| `Unexpected error` | Run again with `VOICE_TEST_DEBUG=1` and send Claude the error text (never the recordings). |
