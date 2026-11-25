import { readBody, staffRoute } from "@/lib/operations/http";
import { releaseHost } from "@/lib/operations/sessions";
import { tableActionSchema } from "@/lib/validators";

export const POST = staffRoute(["ADMIN", "WAITER"], async (request, restaurantId) => {
  const { tableId, sessionId } = await readBody(request, tableActionSchema);
  return releaseHost({ id: tableId, restaurantId }, sessionId);
});
