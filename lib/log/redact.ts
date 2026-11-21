/**
 * Redaction for the safe logger. Rule 5: never log audio, transcripts, phone numbers or payment
 * screenshots. This works in two layers:
 *   1. by KEY NAME: a field called "transcript" or "phoneNumber" is dropped whatever it holds;
 *   2. by VALUE SHAPE: a phone number, JWT, data: URL or big base64 blob hidden in an innocent field
 *      (or inside an error message) is replaced.
 */

const REDACTED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

// Matched against the key lower-cased with everything but letters and digits removed.
const SENSITIVE_KEY_PARTS = [
  "audio",
  "transcript",
  "utterance",
  "phone",
  "msisdn",
  "mobile",
  "screenshot",
  "receipt",
  "cnic",
  "password",
  "passwd",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "prompt",
  "completion",
];
// Whole words that mark a field as sensitive wherever they appear in its name: user_email, sessionToken, answerText.
const SENSITIVE_KEY_WORDS = new Set([
  "otp",
  "token",
  "email",
  "text",
  "messages",
  "answer",
  "response",
  "body",
  "image",
  "photo",
  "file",
  "blob",
]);
// Only sensitive when it is the entire key ("message" alone), because errorMessage is usually safe and useful.
const SENSITIVE_KEY_EXACT = new Set(["message"]);
// A harmless number under a sensitive-looking key (audioSeconds, transcriptLength, promptTokens) is useful and safe.
const SAFE_NUMERIC_SUFFIXES = ["seconds", "bytes", "length", "count", "ms", "chars", "tokens", "duration"];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key);
  return (
    SENSITIVE_KEY_EXACT.has(k) ||
    SENSITIVE_KEY_PARTS.some((part) => k.includes(part)) ||
    keyWords(key).some((word) => SENSITIVE_KEY_WORDS.has(word))
  );
}

function isSafeMeasurement(key: string, value: unknown): boolean {
  if (typeof value !== "number" && typeof value !== "boolean") return false;
  const k = normalizeKey(key);
  return SAFE_NUMERIC_SUFFIXES.some((suffix) => k.endsWith(suffix));
}

const PHONE_PATTERNS: RegExp[] = [
  // International Pakistani mobile: +92 300 1234567, 0092-300-1234567, 923001234567
  /(?<!\d)(?:\+|00)?92[\s-]?3\d{2}[\s-]?\d{7}(?!\d)/g,
  // Local Pakistani mobile: 0300 1234567, 03001234567
  /(?<!\d)03\d{2}[\s-]?\d{7}(?!\d)/g,
  // Any other international number written with a plus sign
  /\+\d[\d\s-]{8,15}\d/g,
];
const JWT_PATTERN = /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g;
const DATA_URL_PATTERN = /data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+/g;
const BLOB_PATTERN = /^[A-Za-z0-9+/=_-]{200,}$/;

export function redactString(input: string): string {
  if (BLOB_PATTERN.test(input)) return "[redacted:blob]";
  let out = input.replace(DATA_URL_PATTERN, "[redacted:data-url]").replace(JWT_PATTERN, "[redacted:token]");
  for (const pattern of PHONE_PATTERNS) out = out.replace(pattern, "[redacted:phone]");
  return out.length > MAX_STRING_LENGTH ? `${out.slice(0, MAX_STRING_LENGTH)}...[truncated]` : out;
}

function binarySize(value: unknown): number | undefined {
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength; // Buffer, Uint8Array, DataView...
  if (typeof Blob !== "undefined" && value instanceof Blob) return value.size; // File extends Blob
  return undefined;
}

export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  switch (typeof value) {
    case "string":
      return redactString(value);
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "symbol":
      return "[symbol]";
    case "function":
      return "[function]";
  }

  const size = binarySize(value);
  if (size !== undefined) return `[redacted:binary ${size} bytes]`;

  const obj = value as object;
  if (seen.has(obj)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[max-depth]";
  seen.add(obj);

  try {
    if (obj instanceof Error) {
      // Message only, redacted. No stack: it can echo the message and adds nothing the event name lacks.
      return { name: obj.name, message: redactString(obj.message) };
    }
    if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? "[invalid-date]" : obj.toISOString();
    if (obj instanceof Map || obj instanceof Set) return `[${obj.constructor.name} of ${obj.size}]`;
    if (Array.isArray(obj)) {
      const items = obj.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1, seen));
      if (obj.length > MAX_ARRAY_ITEMS) items.push(`[+${obj.length - MAX_ARRAY_ITEMS} more]`);
      return items;
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      out[key] = isSensitiveKey(key) && !isSafeMeasurement(key, child) ? REDACTED : redact(child, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(obj); // only true cycles count as circular, not a value shared twice
  }
}
