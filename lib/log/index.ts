import { redact, redactString } from "./redact";

export { isSensitiveKey, redact, redactString } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogSink = (level: LogLevel, line: string) => void;

export interface LoggerOptions {
  /** Where finished lines go. Defaults to the console. */
  sink?: LogSink;
  /** Lowest level to print. Defaults to LOG_LEVEL, then "info". */
  level?: LogLevel;
  now?: () => Date;
}

export interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

const consoleSink: LogSink = (level, line) => {
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
};

function levelFromEnv(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  return raw && raw in ORDER ? (raw as LogLevel) : "info";
}

/**
 * Safe logger: one JSON line per event, everything passed through redaction first.
 * Use event names like "attempt.saved" and put facts (ids, counts, seconds, PKR) in data.
 * Never pass raw audio, transcripts, phone numbers or payment screenshots; if one slips in, it is redacted.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? consoleSink;
  const threshold = ORDER[options.level ?? levelFromEnv()];
  const now = options.now ?? (() => new Date());

  const write = (level: LogLevel, event: string, data?: Record<string, unknown>) => {
    if (ORDER[level] < threshold) return;
    const entry = { time: now().toISOString(), level, event: redactString(event), data: data ? redact(data) : undefined };
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({ time: entry.time, level, event: entry.event, data: "[unserializable]" });
    }
    sink(level, line);
  };

  return {
    debug: (event, data) => write("debug", event, data),
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data),
  };
}

/** The app-wide logger. */
export const log: Logger = createLogger();
