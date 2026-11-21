import { describe, expect, it } from "vitest";
import { ConfigError } from "@/lib/config";
import { readFxPkrPerUsd, sumCosts, usdToPkr } from "./index";

describe("usdToPkr", () => {
  it("returns the raw USD, the PKR cost and the rate used", () => {
    expect(usdToPkr(0.01, 280)).toEqual({ costUsd: 0.01, costPkr: 2.8, fxPkrPerUsd: 280 });
  });

  it("does not round the raw USD cost", () => {
    expect(usdToPkr(0.0123456789, 280).costUsd).toBe(0.0123456789);
  });

  it("rounds PKR to 4 decimal places", () => {
    // 0.000123 USD x 281.37 = 0.03460851 PKR
    expect(usdToPkr(0.000123, 281.37).costPkr).toBe(0.0346);
  });

  it("handles a free call", () => {
    expect(usdToPkr(0, 280)).toEqual({ costUsd: 0, costPkr: 0, fxPkrPerUsd: 280 });
  });

  it.each([-0.01, Number.NaN, Number.POSITIVE_INFINITY])("rejects a bad USD cost %s", (bad) => {
    expect(() => usdToPkr(bad, 280)).toThrow(RangeError);
  });

  it.each([0, -1, Number.NaN])("rejects a bad rate %s", (bad) => {
    expect(() => usdToPkr(1, bad)).toThrow(RangeError);
  });

  it("reads the rate from FX_PKR_PER_USD when none is given", () => {
    const previous = process.env.FX_PKR_PER_USD;
    process.env.FX_PKR_PER_USD = "300";
    try {
      expect(usdToPkr(2)).toEqual({ costUsd: 2, costPkr: 600, fxPkrPerUsd: 300 });
    } finally {
      if (previous === undefined) delete process.env.FX_PKR_PER_USD;
      else process.env.FX_PKR_PER_USD = previous;
    }
  });
});

describe("readFxPkrPerUsd", () => {
  it("reads a number", () => {
    expect(readFxPkrPerUsd({ FX_PKR_PER_USD: " 281.5 " })).toBe(281.5);
  });

  it("throws a clear error when missing or empty", () => {
    for (const env of [{}, { FX_PKR_PER_USD: "" }]) {
      expect(() => readFxPkrPerUsd(env)).toThrow(ConfigError);
      expect(() => readFxPkrPerUsd(env)).toThrow(/FX_PKR_PER_USD/);
    }
  });

  it.each(["abc", "0", "-5", "Infinity"])("throws for %j", (value) => {
    expect(() => readFxPkrPerUsd({ FX_PKR_PER_USD: value })).toThrow(/FX_PKR_PER_USD/);
  });
});

describe("sumCosts", () => {
  it("adds the calls of one attempt", () => {
    const stt = usdToPkr(0.006, 280);
    const llm = usdToPkr(0.002, 280);
    const tts = usdToPkr(0.001, 280);
    const total = sumCosts([stt, llm, tts]);
    expect(total.costUsd).toBe(0.009);
    expect(total.costPkr).toBe(2.52);
    expect(total.fxPkrPerUsd).toBe(280);
  });

  it("refuses to mix rates", () => {
    expect(() => sumCosts([usdToPkr(1, 280), usdToPkr(1, 290)])).toThrow(/different FX rates/);
  });

  it("refuses an empty list", () => {
    expect(() => sumCosts([])).toThrow(RangeError);
  });
});
