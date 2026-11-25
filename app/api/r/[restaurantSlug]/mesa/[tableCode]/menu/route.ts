import { guestRoute } from "@/lib/operations/http";
import { findTable, readMenu } from "@/lib/operations/sessions";

export const GET = guestRoute(async (_request, params) => readMenu(await findTable(params)));
