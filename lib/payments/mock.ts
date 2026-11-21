import type { PaymentProvider } from "./types";

/** Fake gateway that confirms instantly. For local work and tests only. */
export const mockPayments: PaymentProvider = {
  name: "mock",
  mode: "gateway",
  async startPayment(request) {
    return { provider: "mock", status: "paid", providerPaymentId: `mock_${request.reference}`, feePkr: 0 };
  },
  async refund() {
    return { provider: "mock", status: "refunded" };
  },
};
