import { decidePayment } from "@/lib/operations/checkout";
import { readBody, staffRoute } from "@/lib/operations/http";
import { paymentDecisionSchema } from "@/lib/validators";

export const PATCH = staffRoute(["ADMIN", "WAITER"], async (request, restaurantId) => {
  const input = await readBody(request, paymentDecisionSchema);
  return decidePayment(restaurantId, input);
});
