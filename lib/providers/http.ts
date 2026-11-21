import { ProviderError } from "./errors";

const MAX_DETAIL_CHARS = 300;

/** Pulls a short, printable reason out of a provider's error body. Never returns more than a few lines. */
export function errorDetail(bodyText: string): string {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      // OpenAI and Gemini: { error: { message } }. Deepgram: { err_code, err_msg }.
      const error = record.error;
      const nested = error && typeof error === "object" ? (error as Record<string, unknown>).message : undefined;
      const message = [nested, record.err_msg, record.message, typeof error === "string" ? error : undefined].find(
        (value): value is string => typeof value === "string" && value.trim() !== "",
      );
      if (message) return message.trim().slice(0, MAX_DETAIL_CHARS);
    }
  } catch {
    // not JSON: fall through to the plain text
  }
  const plain = bodyText.trim().replace(/\s+/g, " ");
  return plain === "" ? "empty reply" : plain.slice(0, MAX_DETAIL_CHARS);
}

/**
 * Sends one request and returns the parsed JSON reply. One attempt only; callers decide about retries.
 * Failures become a ProviderError that never includes the request body or the URL.
 */
export async function sendJsonRequest(
  provider: string,
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs = 60_000,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? `no reply within ${timeoutMs / 1000} s` : "network error";
    throw new ProviderError(provider, null, reason);
  }
  const text = await response.text();
  if (!response.ok) throw new ProviderError(provider, response.status, errorDetail(text));
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError(provider, response.status, "the reply was not JSON");
  }
}
