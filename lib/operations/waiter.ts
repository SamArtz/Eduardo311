import "server-only";

import type { Prisma } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/prisma";
import type { waiterQuerySchema } from "@/lib/validators";

import { requireThat } from "./http";
import { publish } from "./realtime";
import { withActiveTable, withHost, type TableKey } from "./sessions";

const pendingAlert = { resolvedAt: null, cancelledAt: null } satisfies Prisma.ServiceAlertWhereInput;
const alertView = {
  id: true, createdAt: true, resolvedAt: true, cancelledAt: true, responseTimeSeconds: true,
} satisfies Prisma.ServiceAlertSelect;

export async function callWaiter(request: Request, table: TableKey, sessionId: string) {
  const { restaurantId } = table;
  const result = await withHost(request, table, sessionId, async (tx) => {
    const where = { restaurantId, sessionId, ...pendingAlert };
    const current = await tx.serviceAlert.findFirst({ where, select: alertView });
    if (current) return { alert: current, created: false };
    const alert = await tx.serviceAlert.create({ data: { restaurantId, sessionId }, select: alertView });
    return { alert, created: true };
  });
  if (result.created) publish(restaurantId, { topic: "alerts", tableId: table.id });
  return result;
}

export async function resolveAlert(restaurantId: string, alertId: string) {
  const where = { restaurantId_id: { restaurantId, id: alertId } };
  const lookup = await prisma.serviceAlert.findUnique({
    where,
    select: { ...alertView, sessionId: true, session: { select: { tableId: true } } },
  });
  requireThat(lookup, 404, "Alerta no encontrada");
  const { session, sessionId, ...alert } = lookup;
  if (alert.resolvedAt) return { alert };
  const table = { restaurantId, id: session.tableId };

  const result = await withActiveTable(table, sessionId, async (tx) => {
    const current = await tx.serviceAlert.findUniqueOrThrow({ where, select: alertView });
    if (current.resolvedAt) return { alert: current, changed: false };
    const now = new Date(Math.max(Date.now(), current.createdAt.getTime()));
    const responseTimeSeconds = Math.floor((now.getTime() - current.createdAt.getTime()) / 1000);
    const alert = await tx.serviceAlert.update({
      where, data: { resolvedAt: now, responseTimeSeconds }, select: alertView,
    });
    return { alert, changed: true };
  });
  if (result.changed) publish(restaurantId, { topic: "alerts", tableId: table.id });
  return { alert: result.alert };
}

export async function readWaiterBoard(restaurantId: string, filter: z.infer<typeof waiterQuerySchema>["filter"]) {
  const [tables, priorityAlerts] = await prisma.$transaction(async (tx) => {
    const tables = await tx.diningTable.findMany({
      where: { restaurantId },
      orderBy: { number: "asc" },
      select: {
        id: true, number: true, status: true,
        sessions: {
          where: { status: "ACTIVE" },
          take: 1,
          select: {
            id: true, guestCount: true, createdAt: true, hostTokenHash: true,
            alerts: { where: pendingAlert, select: alertView },
            orders: {
              where: { items: { some: { status: "READY" } } },
              orderBy: { createdAt: "asc" },
              select: {
                id: true, createdAt: true,
                items: { where: { status: "READY" }, select: { id: true, name: true, quantity: true, stationId: true } },
              },
            },
            payments: {
              where: { status: "PENDING" },
              select: { id: true, method: true, totalCents: true, createdAt: true },
            },
          },
        },
      },
    });
    const priorityAlerts = await tx.serviceAlert.findMany({
      where: { restaurantId, ...pendingAlert, session: { status: "ACTIVE" } },
      orderBy: { createdAt: "asc" },
      select: {
        ...alertView,
        session: { select: { id: true, guestCount: true, table: { select: { id: true, number: true } } } },
      },
    });
    return [tables, priorityAlerts] as const;
  }, { isolationLevel: "RepeatableRead" });

  const visible = tables.filter(({ sessions: [session] }) =>
    (filter === "ALL")
    || (filter === "ALERT" && Boolean(session?.alerts.length))
    || (filter === "READY" && Boolean(session?.orders.length))
    || (filter === "ACTIVE" && Boolean(session))
    || (filter === "FREE" && !session),
  ).map(({ sessions: [session], ...table }) => {
    if (!session) return { ...table, active: null };
    const { hostTokenHash, ...data } = session;
    return { ...table, active: { ...data, hasHost: hostTokenHash !== null } };
  });

  return { tables: visible, priorityAlerts };
}
