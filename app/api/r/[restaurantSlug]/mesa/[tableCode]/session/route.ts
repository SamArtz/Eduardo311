import { guestRoute, readBody } from "@/lib/operations/http";
import { claimSession, findTable, readTable } from "@/lib/operations/sessions";
import { claimSessionSchema } from "@/lib/validators";

export const GET = guestRoute(async (request, params) => readTable(await findTable(params), request));

export const POST = guestRoute(async (request, params) => {
  const input = await readBody(request, claimSessionSchema);
  return claimSession(await findTable(params), input, request);
});
