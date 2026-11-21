# Lessons (P0-3)

The lessons for both the WhatsApp pilot and the later app. Each lesson is one JSON file: `content/<track>/day-NN.json`. Interview-track Days 1-14 are here, all with `"status": "draft"`. They are written from general public interview knowledge only, never from any employer's material (the `source` field says so, and approving a lesson confirms it).

## Reviewing a lesson

Read it either way, they hold the same text:
- **The pilot pack** `content/pilot/interview-day-NN.md`: the lesson as plain text, easiest to read.
- **The JSON file** `content/interview/day-NN.json`: what you edit.

For each lesson, check:
1. The English is correct and natural, and the example answers sound like real people.
2. The Roman Urdu meanings and instructions are right and clear.
3. Each answer is short enough to say in well under a minute.
4. Nothing promises a job, a visa or a salary, nothing says "verified", "official" or "certified", and nothing sounds like a Gulf job (CLAUDE.md copy rules).
5. Each question in `review_notes` has an answer. Change the lesson if needed, then delete the note.

## Editing

Change the words between the quotation marks. Keep the commas and brackets as they are. If you need a quotation mark inside a text, use a single quote (`'like this'`). After any edit run:

```bash
npm run content:check
```

It lists every mistake with the file and the field, and for a JSON slip it gives the line and column. It also lists sentences that contain words a person should look at (for example "salary" on Day 13, which is interview vocabulary and not a promise).

| Field | What it is |
|---|---|
| `status` | `draft` or `approved`. Only approved lessons are shown in the app. |
| `version` | Starts at 1. After launch, raise it by 1 whenever you change an approved lesson: the tutor audio is made once per version. |
| `title`, `goal` | The lesson's name (Roman Urdu) and what the learner can do afterwards (English, one line). |
| `phrases` | 3 or 4 phrases: the English `text` (`...` is the part the learner fills in), its Roman Urdu `meaning`, and an `example` sentence. |
| `roleplay` | 4 to 6 turns. `tutor_line` is what the interviewer says (up to 30 words). `task` tells the learner what to do, in Roman Urdu. `model_answer` is one good answer (up to 90 words). `target_phrases` lists which phrases (`p1`, `p2`...) the learner should try to use. |
| `review_notes` | My questions for you. Must be empty before a lesson can be approved. |

Every phrase must be used by at least one turn. The checker tells you if one is not.

## Approving

1. Set `"status": "approved"` and make `review_notes` an empty list: `"review_notes": []`.
2. Run `npm run content:check`. It refuses an approved lesson that still has notes.
3. Run `npm run content:pilot` so the pilot pack shows the new status. (`npm run check` fails if you forget.)

## Running a pilot day

Open `content/pilot/interview-day-01.md`, copy everything below the line `PASTE FROM THE NEXT LINE DOWN` into a new Claude chat, and send it. Claude's first reply is the opening message for the learner. Send each reply to the learner on WhatsApp, and paste each learner answer back, typed or turned from a voice note into text. Start a message with `FOUNDER:` to talk to Claude yourself instead of the learner.

Do not edit the pilot packs by hand: they are generated from the lessons and prompts, and `npm run content:pilot` rewrites them.

## Roman Urdu style

Polite "aap". Spellings match the app's own texts: `karein`, `bolein`, `batayein`, `likhein`, `dein`, `hai`, `hain`, `mein`. Gender is shown as `achha/achhi`, `karta/karti`. Short sentences.

## Urdu script

Not written yet. Every Roman Urdu line has room for an Urdu-script version next to it (`"urdu": "..."` beside `"roman": "..."`). Before the app launches, `npm run content:check -- --require-urdu` lists every line that still needs one.

## The prompts

`prompts/tutor-feedback.md` is the feedback prompt the app will use. `prompts/tutor-pilot.md` is the pilot session prompt; it reuses the scoring rules from the feedback prompt, so the two cannot drift apart. Each has a `version` at the top. If you change a prompt, raise its version and ask Claude to update the pinned check in `content/prompts-and-pilot.test.ts`: the tests fail until you do.
