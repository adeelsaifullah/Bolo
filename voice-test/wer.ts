// Word error rate (WER) for the voice test. The same cleaning is applied to the reference and to the transcript,
// so providers are not punished for punctuation, capital letters or "um" and "uh".

const FILLERS = new Set(["um", "uh", "er", "erm", "ah", "hmm", "mm", "mhm", "uhm"]);
const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0 to 999 in English words: 45 -> "forty five". Longer numbers are left as digits. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new RangeError(`numberToWords handles 0 to 999, got ${n}`);
  if (n < 20) return ONES[n]!;
  if (n < 100) return [TENS[Math.floor(n / 10)], n % 10 ? ONES[n % 10] : ""].filter(Boolean).join(" ");
  const rest = n % 100;
  return [ONES[Math.floor(n / 100)], "hundred", rest ? numberToWords(rest) : ""].filter(Boolean).join(" ");
}

/**
 * Cleans text into a list of words: lower case, no punctuation (apostrophes inside words stay), hyphens become spaces,
 * numbers up to 999 spelled out, and "um", "uh" and similar fillers dropped.
 */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .split(" ")
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .flatMap((word) => (/^\d{1,3}$/.test(word) ? numberToWords(Number(word)).split(" ") : [word]))
    .filter((word) => !FILLERS.has(word));
}

export interface WordErrors {
  substitutions: number;
  deletions: number;
  insertions: number;
  /** Number of words in the reference. */
  refWords: number;
}

/** Counts the fewest word changes that turn the reference into the transcript. */
export function countWordErrors(reference: readonly string[], hypothesis: readonly string[]): WordErrors {
  const n = reference.length;
  const m = hypothesis.length;
  const width = m + 1;
  const cost = new Int32Array((n + 1) * width);
  const at = (i: number, j: number) => cost[i * width + j]!;

  for (let i = 0; i <= n; i++) cost[i * width] = i;
  for (let j = 0; j <= m; j++) cost[j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = reference[i - 1] === hypothesis[j - 1] ? 0 : 1;
      cost[i * width + j] = Math.min(at(i - 1, j - 1) + same, at(i - 1, j) + 1, at(i, j - 1) + 1);
    }
  }

  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && at(i, j) === at(i - 1, j - 1) + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)) {
      if (reference[i - 1] !== hypothesis[j - 1]) substitutions++;
      i--;
      j--;
    } else if (i > 0 && at(i, j) === at(i - 1, j) + 1) {
      deletions++;
      i--;
    } else {
      insertions++;
      j--;
    }
  }
  return { substitutions, deletions, insertions, refWords: n };
}

/** Errors from the reference text and the transcript text. Throws if the reference has no words. */
export function wordErrorsForText(referenceText: string, transcript: string): WordErrors {
  const reference = normalizeWords(referenceText);
  if (reference.length === 0) throw new RangeError("the reference transcript has no words");
  return countWordErrors(reference, normalizeWords(transcript));
}

export function totalErrors(e: Pick<WordErrors, "substitutions" | "deletions" | "insertions">): number {
  return e.substitutions + e.deletions + e.insertions;
}
