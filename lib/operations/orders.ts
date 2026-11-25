import "server-only";

import type { OrderStatus } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/prisma";
import type { createOrderSchema, updateKitchenItemSchema } from "@/lib/validators";

import { requireThat } from "./http";
import { publish } from "./realtime";
import { withHost, type TableKey } from "./sessions";

export function moneyInt(value: number) {
  requireThat(Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647, 422, "El importe excede el rango permitido");
  return value;
}

export function roundedRate(cents: number, rateBps: number) {
  return Math.floor((cents * rateBps + 5000) / 10_000);
}

export async function createOrder(request: Request, table: TableKey, input: z.infer<typeof createOrderSchema>) {
  const { restaurantId } = table;
  const result = await withHost(request, table, input.sessionId, async (tx, session) => {
    const unique = { restaurantId, sessionId: session.id, requestId: input.requestId };
    const existing = await tx.order.findUnique({ where: { restaurantId_sessionId_requestId: unique } });
    if (existing) return { order: existing, created: false };

    const checkout = await tx.payment.findFirst({
      where: { restaurantId, sessionId: session.id, status: { not: "CANCELLED" } },
      select: { id: true },
    });
    requireThat(!checkout, 409, "La cuenta ya se está liquidando");

    const [restaurant, menu, current] = await Promise.all([
      tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { taxBps: true } }),
      tx.menuItem.findMany({
        where: { restaurantId, id: { in: input.items.map(({ menuItemId }) => menuItemId) }, available: true },
        include: { modifiers: { where: { available: true } } },
      }),
      tx.order.aggregate({ where: { restaurantId, sessionId: session.id }, _sum: { totalCents: true } }),
    ]);
    const byId = new Map(menu.map((item) => [item.id, item]));
    const items = input.items.map((line) => {
      const item = byId.get(line.menuItemId);
      requireThat(item, 422, "Un platillo ya no está disponible");
      const modifiers = line.modifierIds.map((id) => {
        const modifier = item.modifiers.find((option) => option.id === id);
        requireThat(modifier, 422, "Un modificador no está disponible para ese platillo");
        return modifier;
      });
      requireThat(modifiers.filter(({ kind }) => kind === "SIZE").length <= 1, 422, "Selecciona un solo tamaño");
      const unitPriceCents = moneyInt(item.priceCents + modifiers.reduce((sum, option) => sum + option.priceDeltaCents, 0));
      const tags = [...new Set([...item.tags, ...modifiers.flatMap((option) => option.tags)])]
        .filter((tag) => {
          if (tag !== "VEGAN" && tag !== "GLUTEN_FREE") return true;
          return item.tags.includes(tag) && modifiers.every((modifier) => modifier.tags.includes(tag));
        });
      return {
        menuItemId: item.id,
        stationId: item.stationId,
        name: item.name,
        quantity: line.quantity,
        notes: line.notes,
        tags,
        unitPriceCents,
        subtotalCents: moneyInt(unitPriceCents * line.quantity),
        modifiers: {
          create: modifiers.map(({ name, kind, priceDeltaCents, tags }) => ({ name, kind, priceDeltaCents, tags })),
        },
      };
    });
    const subtotalCents = moneyInt(items.reduce((sum, item) => sum + item.subtotalCents, 0));
    const taxCents = roundedRate(subtotalCents, restaurant.taxBps);
    const totalCents = moneyInt(subtotalCents + taxCents);
    moneyInt((current._sum.totalCents ?? 0) + totalCents);

    const order = await tx.order.create({
      data: {
        ...unique, subtotalCents, taxBps: restaurant.taxBps, taxCents, totalCents,
        items: { create: items },
      },
    });
    return { order, created: true };
  });

  if (result.created) publish(restaurantId, { topic: "orders", tableId: table.id });
  return result;
}

export async function readKds(restaurantId: string, stationId?: string) {
  const stations = await prisma.kitchenStation.findMany({
    where: { restaurantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  requireThat(!stationId || stations.some(({ id }) => id === stationId), 404, "Estación no encontrada");
  const statuses = ["NEW", "PREPARING", "READY"] as const;
  const items = await prisma.orderItem.findMany({
    where: { restaurantId, stationId, status: { in: [...statuses] } },
    orderBy: [{ order: { createdAt: "asc" } }, { id: "asc" }],
    select: {
      id: true, name: true, status: true, quantity: true, notes: true, tags: true, stationId: true,
      preparingAt: true, readyAt: true,
      modifiers: { select: { name: true, kind: true, tags: true } },
      order: {
        select: { id: true, createdAt: true, session: { select: { guestCount: true, table: { select: { number: true } } } } },
      },
    },
  });
  const columns = Object.fromEntries(statuses.map((status) => {
    const tickets = new Map<string, {
      orderId: string;
      tableNumber: number;
      guestCount: number;
      createdAt: Date;
      items: Omit<(typeof items)[number], "order">[];
    }>();
    for (const { order, ...item } of items) {
      if (item.status !== status) continue;
      let ticket = tickets.get(order.id);
      if (!ticket) {
        ticket = {
          orderId: order.id, tableNumber: order.session.table.number,
          guestCount: order.session.guestCount, createdAt: order.createdAt, items: [],
        };
        tickets.set(order.id, ticket);
      }
      ticket.items.push(item);
    }
    return [status, [...tickets.values()]];
  }));
  return { stations, columns };
}

const previousStatus = {
  PREPARING: "NEW",
  READY: "PREPARING",
  DELIVERED: "READY",
} satisfies Record<z.infer<typeof updateKitchenItemSchema>["status"], OrderStatus>;

export async function updateKitchenItem(restaurantId: string, input: z.infer<typeof updateKitchenItemSchema>) {
  const { orderItemId, status } = input;
  const result = await prisma.$transaction(async (tx) => {
    const where = { restaurantId, id: orderItemId };
    const item = await tx.orderItem.findUnique({
      where: { restaurantId_id: where },
      select: { status: true, order: { select: { session: { select: { tableId: true } } } } },
    });
    requireThat(item, 404, "Ítem no encontrado");
    if (item.status === status) return { changed: false, tableId: item.order.session.tableId };

    const now = new Date();
    const timestamp = {
      PREPARING: { preparingAt: now },
      READY: { readyAt: now },
      DELIVERED: { deliveredAt: now },
    };
    const result = await tx.orderItem.updateMany({
      where: { ...where, status: previousStatus[status] },
      data: { status, ...timestamp[status] },
    });
    requireThat(result.count === 1, 409, "El ítem cambió o la transición no es válida");
    return { changed: true, tableId: item.order.session.tableId };
  });

  if (result.changed) publish(restaurantId, { topic: "orders", tableId: result.tableId });
  return { orderItemId, status };
}
