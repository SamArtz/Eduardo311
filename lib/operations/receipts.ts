import "server-only";

export type Receipt = {
  paymentId: string;
  email: string;
  currency: string;
  totalCents: number;
};

export async function sendReceipt(receipt: Receipt) {
  if (process.env.NODE_ENV === "development") {
    console.info("Recibo simulado", {
      paymentId: receipt.paymentId,
      recipient: receipt.email.replace(/^.+@/, "***@"),
      currency: receipt.currency,
      totalCents: receipt.totalCents,
    });
  }
}
