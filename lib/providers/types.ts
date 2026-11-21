/** Every AI provider call reports the raw provider cost in USD, so lib/cost can add PKR later. */
export interface CostedResult {
  /** Which implementation produced this result, e.g. "mock". */
  provider: string;
  /** Raw provider cost in USD for this call. 0 for mocks and manual flows. */
  costUsd: number;
}
