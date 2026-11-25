import "server-only";

import type { Prisma, TableSession } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/prisma";
import type { claimSessionSchema } from "@/lib/validators";

import { guestToken, readHostToken, requireThat, tokenHash, type TableParams } from "./http";
import { publish } from "./realtime";

export type TableKey = { restaurantId: string; id: string };
type Database = Prisma.TransactionClient;

export async function findTable({ restaurantSlug, tableCode }: TableParams) {
  const table = await prisma.diningTable.findFirst({
    where: { tableCode, restaurant: { slug: restaurantSlug } },
    select: { id: true, restaurantId: true, number: true },
  });
  requireThat(table, 404, "Mesa no encontrada");
  return table;
}

export async function lockTable(tx: Database, table: TableKey) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "DiningTable"
    WHERE "restaurantId" = ${table.restaurantId} AND "id" = ${table.id}
    FOR UPDATE
  `;
  requireThat(rows.length, 404, "Mesa no encontrada");
}

function activeSession(tx: Database, table: TableKey) {
  return tx.tableSession.findFirst({
    where: { restaurantId: table.restaurantId, tableId: table.id, status: "ACTIVE" },
  });
}

export function sessionKey(session: Pick<TableSession, "restaurantId" | "id">) {
  return { restaurantId_id: { restaurantId: session.restaurantId, id: session.id } };
}

function isHost(session: TableSession, token?: string) {
  return Boolean(token && session.hostTokenHash === tokenHash(token));
}

function sessionView(session: TableSession, token?: string) {
  const host = isHost(session, token);
  return {
    id: session.id,
    guestCount: session.guestCount,
    createdAt: session.createdAt,
    role: host ? "HOST" : "GUEST",
    canClaim: session.hostTokenHash === null,
    ...(host ? { hostName: session.hostName } : {}),
  };
}

export async function claimSession(
  table: TableKey,
  input: z.infer<typeof claimSessionSchema>,
  request: Request,
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockTable(tx, table);
    const active = await activeSession(tx, table);
    if (active?.hostTokenHash) return { session: sessionView(active, readHostToken(request)) };

    const hostToken = guestToken();
    const hostTokenHash = tokenHash(hostToken);
    if (active) {
      const session = await tx.tableSession.update({
        where: sessionKey(active),
        data: { hostTokenHash, hostName: input.hostName ?? null },
      });
      return { session: sessionView(session, hostToken), hostToken };
    }

    const { guestCount, hostName } = input;
    requireThat(guestCount, 400, "Indica cuántas personas hay en la mesa");
    const updated = await tx.diningTable.updateMany({
      where: { restaurantId: table.restaurantId, id: table.id, status: "FREE" },
      data: { status: "ACTIVE" },
    });
    requireThat(updated.count === 1, 409, "La mesa ya está ocupada");
    const session = await tx.tableSession.create({
      data: { restaurantId: table.restaurantId, tableId: table.id, guestCount, hostName, hostTokenHash },
    });
    return { session: sessionView(session, hostToken), hostToken };
  });

  if (result.hostToken) publish(table.restaurantId, { topic: "session", tableId: table.id });
  return result;
}

export async function withActiveTable<T>(
  table: TableKey, sessionId: string, perform: (tx: Database, session: TableSession) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await lockTable(tx, table);
    const session = await activeSession(tx, table);
    requireThat(session?.id === sessionId && session, 409, "La sesión de la mesa cambió o se cerró");
    return perform(tx, session);
  });
}

export function withHost<T>(
  request: Request, table: TableKey, sessionId: string,
  perform: (tx: Database, session: TableSession) => Promise<T>,
) {
  const token = readHostToken(request);
  requireThat(token, 403, "Solo el anfitrión puede realizar esta acción");
  return withActiveTable(table, sessionId, (tx, session) => {
    requireThat(isHost(session, token), 403, "El control del anfitrión no está vigente");
    return perform(tx, session);
  });
}

export async function releaseHost(table: TableKey, sessionId: string) {
  await withActiveTable(table, sessionId, async (tx, session) => {
    await tx.tableSession.update({
      where: sessionKey(session),
      data: { hostTokenHash: null, hostName: null },
    });
  });
  publish(table.restaurantId, { topic: "session", tableId: table.id });
  return { released: true };
}

export async function freeTable(tx: Database, session: TableSession, closedAt: Date) {
  const { id: sessionId, restaurantId, tableId } = session;
  await tx.$executeRaw`
    UPDATE "ServiceAlert" SET "cancelledAt" = GREATEST("createdAt", ${closedAt}::timestamp)
    WHERE "restaurantId" = ${restaurantId} AND "sessionId" = ${sessionId}
      AND "resolvedAt" IS NULL AND "cancelledAt" IS NULL
  `;

  await tx.tableSession.update({
    where: sessionKey(session),
    data: { status: "CLOSED", closedAt, hostTokenHash: null },
  });
  await tx.diningTable.update({
    where: { restaurantId_id: { restaurantId, id: tableId } },
    data: { status: "FREE" },
  });
}

export async function readTable(table: Awaited<ReturnType<typeof findTable>>, request: Request) {
  const [restaurant, active] = await prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: table.restaurantId },
      select: {
        id: true, name: true, slug: true, currency: true, taxBps: true,
        wifiSsid: true, wifiPassword: true,
      },
    });
    const active = await activeSession(tx, table);
    if (!active) return [restaurant, null] as const;

    const session = sessionView(active, readHostToken(request));
    const orders = await tx.order.findMany({
      where: { restaurantId: table.restaurantId, sessionId: active.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, createdAt: true,
        items: {
          select: {
            id: true, name: true, quantity: true, status: true, readyAt: true, deliveredAt: true,
            ...(session.role === "HOST" ? {
              unitPriceCents: true, subtotalCents: true, notes: true,
              modifiers: { select: { name: true, kind: true, priceDeltaCents: true } },
            } : {}),
          },
        },
        ...(session.role === "HOST" ? { subtotalCents: true, taxCents: true, totalCents: true } : {}),
      },
    });
    const alert = await tx.serviceAlert.findFirst({
      where: { restaurantId: table.restaurantId, sessionId: active.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, resolvedAt: true, cancelledAt: true, responseTimeSeconds: true },
    });
    const payments = session.role === "HOST" ? await tx.payment.findMany({
      where: { restaurantId: table.restaurantId, sessionId: active.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, method: true, status: true, subtotalCents: true, taxCents: true,
        tipCents: true, totalCents: true, equalPartySize: true, equalShareIndex: true,
        allocations: { select: { orderItemId: true, quantity: true } },
      },
    }) : undefined;
    return [restaurant, { session, orders, alert, payments }] as const;
  }, { isolationLevel: "RepeatableRead" });

  return { restaurant, table: { id: table.id, number: table.number, status: active ? "ACTIVE" : "FREE" }, active };
}

export async function readMenu(table: TableKey) {
  const categories = await prisma.category.findMany({
    where: { restaurantId: table.restaurantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true,
      items: {
        where: { available: true },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, description: true, imageUrl: true, priceCents: true, spiceLevel: true, tags: true,
          modifiers: {
            where: { available: true },
            orderBy: [{ kind: "asc" }, { name: "asc" }],
            select: { id: true, kind: true, name: true, priceDeltaCents: true, tags: true },
          },
        },
      },
    },
  });
  return { categories };
}
