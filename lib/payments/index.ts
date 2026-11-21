import { selectProvider } from "@/lib/providers/select";
import { manualPayments } from "./manual";
import { mockPayments } from "./mock";
import type { PaymentProvider } from "./types";

export type * from "./types";

const registry: Record<string, () => PaymentProvider> = {
  manual: () => manualPayments,
  mock: () => mockPayments,
};

/** Chosen by PAYMENTS_PROVIDER. Defaults to "manual", the Phase 1 flow. */
export function getPaymentProvider(env?: Record<string, string | undefined>): PaymentProvider {
  return selectProvider({ envName: "PAYMENTS_PROVIDER", defaultName: "manual", registry, env });
}
