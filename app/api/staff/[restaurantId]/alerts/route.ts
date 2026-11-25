import { readBody, staffRoute } from "@/lib/operations/http";
import { resolveAlert } from "@/lib/operations/waiter";
import { resolveAlertSchema } from "@/lib/validators";

export const PATCH = staffRoute(["ADMIN", "WAITER"], async (request, restaurantId) => {
  const { alertId } = await readBody(request, resolveAlertSchema);
  return resolveAlert(restaurantId, alertId);
});
