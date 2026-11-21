import { ConfigError } from "@/lib/config/errors";
import type { PaymentProvider, PaymentRequest } from "./types";

function assertAmount(request: PaymentRequest): void {
  if (!Number.isInteger(request.amountPkr) || request.amountPkr <= 0) {
    throw new ConfigError("invalid", "plans", `plans.${request.planId}.price_pkr`, "payment amount must be a positive whole number of PKR");
  }
}

/**
 * Manual wallet payment: the user transfers money and sends the transaction id; an admin approves.
 * This provider calls nothing outside the app. The approve/reject decision and the duplicate
 * transaction-id check live with the payments table in a later session.
 */
export const manualPayments: PaymentProvider = {
  name: "manual",
  mode: "manual",
  async startPayment(request) {
    assertAmount(request);
    return { provider: "manual", status: "awaiting_manual_approval", providerPaymentId: null, feePkr: 0 };
  },
  async refund() {
    return { provider: "manual", status: "manual_refund_required" };
  },
};
