import { z } from "zod";

import { parse, requireStaff, requireThat, restaurantRoute } from "@/lib/operations/http";
import { eventStream } from "@/lib/operations/realtime";
import { prisma } from "@/lib/prisma";
import { tableCodeSchema } from "@/lib/validators";

export const runtime = "nodejs";

const query = z.strictObject({ tableCode: tableCodeSchema.optional() });

export const GET = restaurantRoute(async (request, { restaurantId }) => {
  const { tableCode } = parse(query, Object.fromEntries(new URL(request.url).searchParams));
  if (!tableCode) {
    await requireStaff(request, restaurantId, ["ADMIN", "KITCHEN", "WAITER"]);
    return eventStream(request, restaurantId);
  }

  const table = await prisma.diningTable.findUnique({
    where: { restaurantId_tableCode: { restaurantId, tableCode } },
    select: { id: true },
  });
  requireThat(table, 404, "Mesa no encontrada");
  return eventStream(request, restaurantId, table.id);
});
