import { closeTable } from "@/lib/operations/checkout";
import { readBody, staffRoute } from "@/lib/operations/http";
import { closeTableSchema } from "@/lib/validators";

export const POST = staffRoute(["ADMIN", "WAITER"], async (request, restaurantId) => {
  const { tableId, sessionId, confirmUnpaid } = await readBody(request, closeTableSchema);
  return closeTable({ id: tableId, restaurantId }, sessionId, confirmUnpaid);
});
