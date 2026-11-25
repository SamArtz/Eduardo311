import { createPayment } from "@/lib/operations/checkout";
import { guestRoute, readBody } from "@/lib/operations/http";
import { findTable } from "@/lib/operations/sessions";
import { checkoutSchema } from "@/lib/validators";

export const POST = guestRoute(async (request, params) => {
  const input = await readBody(request, checkoutSchema);
  return createPayment(request, await findTable(params), input);
});
