/**
 * A provider call failed. The message is safe to print and to save: it names the provider and the HTTP status
 * and carries only the provider's short error text, never audio, transcripts or the request body.
 */
export class ProviderError extends Error {
  readonly provider: string;
  /** HTTP status, or null for a network error, a timeout or a reply we could not read. */
  readonly status: number | null;

  constructor(provider: string, status: number | null, detail: string) {
    super(`${provider} request failed${status === null ? "" : ` (HTTP ${status})`}: ${detail}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }

  /** Worth trying again: a network problem, a timeout, "too many requests" or a provider-side error. */
  get retryable(): boolean {
    return this.status === null || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}
