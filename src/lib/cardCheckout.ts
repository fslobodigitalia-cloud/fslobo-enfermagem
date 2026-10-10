import type { ProductOrderSummary } from "./productCheckout";

export const cardAvailable = import.meta.env.VITE_EFI_CARD_ENABLED === "true"
  && Boolean(import.meta.env.VITE_EFI_PAYEE_CODE);

export async function tokenizeCard(card: {
  number: string; cvv: string; month: string; year: string; holder: string; cpf: string;
}): Promise<string | null> {
  try {
    const { default: EfiPay } = await import("payment-token-efi");
    const payee = import.meta.env.VITE_EFI_PAYEE_CODE;
    const environment = import.meta.env.VITE_EFI_CARD_ENVIRONMENT === "production" ? "production" : "sandbox";
    const brand = await EfiPay.CreditCard.setAccount(payee).setEnvironment(environment)
      .setCardNumber(card.number).verifyCardBrand();
    if (!brand || brand === "undefined") return null;
    const response = await EfiPay.CreditCard.setCreditCardData({
      brand, number: card.number, cvv: card.cvv, expirationMonth: card.month,
      expirationYear: card.year, holderName: card.holder, holderDocument: card.cpf, reuse: false,
    }).getPaymentToken();
    return "payment_token" in response && typeof response.payment_token === "string"
      ? response.payment_token : null;
  } catch { return null; }
}

export type CardCheckoutResult =
  | { kind: "processed" | "processing" | "declined"; order: ProductOrderSummary }
  | { kind: "error"; code: string };

export async function createCardOrder(input: {
  checkoutRequestId: string; checkoutAccessToken: string; name: string; email: string;
  slugs: string[]; turnstile: string; cpf: string; phone: string; paymentToken: string;
}): Promise<CardCheckoutResult> {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-product-card-order`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkout_request_id: input.checkoutRequestId,
        checkout_access_token: input.checkoutAccessToken, customer_name: input.name,
        customer_email: input.email, product_slugs: input.slugs, turnstile_token: input.turnstile,
        cpf: input.cpf, phone_number: input.phone, payment_token: input.paymentToken }),
    });
    const data = await response.json();
    if (data?.ok !== true) return { kind: "error", code: typeof data?.error?.code === "string" ? data.error.code : "payment_error" };
    const order = data.order;
    const status = data.payment?.status;
    if (typeof order?.public_id !== "string" || !Number.isSafeInteger(order?.amount_cents)
      || order?.currency !== "BRL" || !Array.isArray(order?.items)
      || !["processed", "processing", "declined"].includes(status)) return { kind: "error", code: "invalid_response" };
    return { kind: status, order: {
      publicId: order.public_id, amountCents: order.amount_cents,
      currency: order.currency, items: order.items,
    } };
  } catch { return { kind: "error", code: "network_error" }; }
}
