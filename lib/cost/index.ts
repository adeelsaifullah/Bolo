import { ConfigError, requireEnv } from "@/lib/config";

/**
 * What one provider call cost. Save all three numbers on the attempt (rule 6):
 * the raw USD cost, the PKR cost, and the rate used, so the PKR figure can be re-checked later.
 */
export interface CostRecord {
  /** Raw provider cost in USD, exactly as reported. */
  costUsd: number;
  /** costUsd x fxPkrPerUsd, rounded to 4 decimal places. */
  costPkr: number;
  /** The FX_PKR_PER_USD value used. */
  fxPkrPerUsd: number;
}

const PKR_DECIMALS = 4;

function roundPkr(value: number): number {
  const factor = 10 ** PKR_DECIMALS;
  return Math.round(value * factor) / factor;
}

// Only used when adding several costs, to drop floating-point noise (0.1 + 0.2). A single call's USD cost is never rounded.
function roundUsd(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}

/** Reads and validates FX_PKR_PER_USD. Throws if it is missing, not a number, or not positive. */
export function readFxPkrPerUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = requireEnv("FX_PKR_PER_USD", env.FX_PKR_PER_USD);
  const fx = Number(raw);
  if (!Number.isFinite(fx) || fx <= 0) {
    throw new ConfigError("invalid", "env", "FX_PKR_PER_USD", `expected a positive number such as 280, got "${raw}".`);
  }
  return fx;
}

/** Turns a provider's USD cost into PKR. Returns both numbers plus the rate used. */
export function usdToPkr(costUsd: number, fxPkrPerUsd: number = readFxPkrPerUsd()): CostRecord {
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    throw new RangeError(`costUsd must be a finite number of 0 or more, got ${String(costUsd)}`);
  }
  if (!Number.isFinite(fxPkrPerUsd) || fxPkrPerUsd <= 0) {
    throw new RangeError(`fxPkrPerUsd must be a positive number, got ${String(fxPkrPerUsd)}`);
  }
  return { costUsd, costPkr: roundPkr(costUsd * fxPkrPerUsd), fxPkrPerUsd };
}

/**
 * Adds the costs of several calls (speech-to-text + LLM + text-to-speech) into one attempt total.
 * All records must use the same rate, otherwise the total would not be reproducible.
 */
export function sumCosts(records: readonly CostRecord[]): CostRecord {
  const first = records[0];
  if (!first) throw new RangeError("sumCosts needs at least one record");
  let costUsd = 0;
  let costPkr = 0;
  for (const record of records) {
    if (record.fxPkrPerUsd !== first.fxPkrPerUsd) {
      throw new RangeError("cannot add costs that used different FX rates");
    }
    costUsd += record.costUsd;
    costPkr += record.costPkr;
  }
  return { costUsd: roundUsd(costUsd), costPkr: roundPkr(costPkr), fxPkrPerUsd: first.fxPkrPerUsd };
}
