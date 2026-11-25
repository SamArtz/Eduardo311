import { parse, staffRoute } from "@/lib/operations/http";
import { readWaiterBoard } from "@/lib/operations/waiter";
import { waiterQuerySchema } from "@/lib/validators";

export const GET = staffRoute(["ADMIN", "WAITER"], (request, restaurantId) => {
  const { filter } = parse(waiterQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return readWaiterBoard(restaurantId, filter);
});
