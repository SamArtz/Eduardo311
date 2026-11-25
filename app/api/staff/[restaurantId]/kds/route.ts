import { parse, readBody, requireStaff, restaurantRoute, staffRoute } from "@/lib/operations/http";
import { readKds, updateKitchenItem } from "@/lib/operations/orders";
import { kdsQuerySchema, updateKitchenItemSchema } from "@/lib/validators";

export const GET = staffRoute(["ADMIN", "KITCHEN"], (request, restaurantId) => {
  const { stationId } = parse(kdsQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return readKds(restaurantId, stationId);
});

export const PATCH = restaurantRoute(async (request, { restaurantId }) => {
  const input = await readBody(request, updateKitchenItemSchema);
  await requireStaff(request, restaurantId, input.status === "DELIVERED"
    ? ["ADMIN", "KITCHEN", "WAITER"]
    : ["ADMIN", "KITCHEN"]);
  return updateKitchenItem(restaurantId, input);
});
