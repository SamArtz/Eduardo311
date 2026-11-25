import { quoteCheckout } from "@/lib/operations/checkout";
import { guestRoute, readBody } from "@/lib/operations/http";
import { findTable } from "@/lib/operations/sessions";
import { checkoutQuoteSchema } from "@/lib/validators";

export const POST = guestRoute(async (request, params) => {
  const input = await readBody(request, checkoutQuoteSchema);
  return quoteCheckout(request, await findTable(params), input);
});
