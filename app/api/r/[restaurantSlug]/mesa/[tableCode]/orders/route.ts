import { guestRoute, readBody } from "@/lib/operations/http";
import { createOrder } from "@/lib/operations/orders";
import { findTable } from "@/lib/operations/sessions";
import { createOrderSchema } from "@/lib/validators";

export const POST = guestRoute(async (request, params) => {
  const input = await readBody(request, createOrderSchema);
  return createOrder(request, await findTable(params), input);
});
