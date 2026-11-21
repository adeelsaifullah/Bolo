export interface PaymentRequest {
  /** Our own idempotency key for this payment attempt. */
  reference: string;
  userId: string;
  planId: string;
  /** Amount in PKR. Always read from config/plans.json by the caller, never hard-coded. */
  amountPkr: number;
}

export type PaymentStartStatus =
  /** Manual flow: the user pays by wallet transfer and an admin approves it later. */
  | "awaiting_manual_approval"
  /** Gateway or mock flow: money confirmed immediately. */
  | "paid";

export interface PaymentStart {
  provider: string;
  status: PaymentStartStatus;
  /** Provider-side id. null for manual flows, where the wallet transaction id is entered by the user. */
  providerPaymentId: string | null;
  /** Provider fee in PKR. 0 when there is none or it is unknown. */
  feePkr: number;
}

export interface RefundRequest {
  reference: string;
  amountPkr: number;
  reason: string;
}

export type RefundStatus =
  /** Manual flow: someone must send the money back by hand. */
  | "manual_refund_required"
  | "refunded";

export interface RefundResult {
  provider: string;
  status: RefundStatus;
}

export interface PaymentProvider {
  readonly name: string;
  /** "manual" providers move no money themselves. */
  readonly mode: "manual" | "gateway";
  startPayment(request: PaymentRequest): Promise<PaymentStart>;
  refund(request: RefundRequest): Promise<RefundResult>;
}
