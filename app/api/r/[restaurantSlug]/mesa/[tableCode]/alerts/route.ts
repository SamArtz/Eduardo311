import { guestRoute, readBody } from "@/lib/operations/http";
import { findTable } from "@/lib/operations/sessions";
import { callWaiter } from "@/lib/operations/waiter";
import { sessionActionSchema } from "@/lib/validators";

export const POST = guestRoute(async (request, params) => {
  const { sessionId } = await readBody(request, sessionActionSchema);
  return callWaiter(request, await findTable(params), sessionId);
});
