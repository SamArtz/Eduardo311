import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";

import type { adminProductSchema, createAdminSchema, deleteAdminSchema, updateAdminSchema } from "@/lib/admin-validation";
import { prisma } from "@/lib/prisma";

import { ApiError, requireThat } from "./http";
import { publish } from "./realtime";
import { lockTable } from "./sessions";

type Tx = Prisma.TransactionClient;
type Change =
  | { method: "create"; input: z.infer<typeof createAdminSchema> }
  | { method: "update"; input: z.infer<typeof updateAdminSchema> }
  | { method: "remove"; input: z.infer<typeof deleteAdminSchema> };

async function dailyStats(tx: Tx, restaurantId: string, timeZone: string) {
  const [{ date, start, end }] = await tx.$queryRaw<{ date: string; start: Date; end: Date }[]>`
    SELECT local_day::date::text AS date,
      (local_day AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC' AS start,
      ((local_day + INTERVAL '1 day') AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC' AS end
    FROM (SELECT date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE ${timeZone}) AS local_day) d
  `;
  const payments = await tx.payment.findMany({
    where: { restaurantId, status: "PAID", paidAt: { gte: start, lt: end } },
    select: {
      paidAt: true, subtotalCents: true, taxCents: true,
      sessionId: true, session: { select: { guestCount: true } },
    },
  });
  const attended = await tx.serviceAlert.aggregate({
    where: { restaurantId, resolvedAt: { gte: start, lt: end } },
    _avg: { responseTimeSeconds: true },
  });
  const active = await tx.tableSession.aggregate({ where: { restaurantId, status: "ACTIVE" }, _sum: { guestCount: true } });
  const hourMs = 3_600_000;
  const formatHour = new Intl.DateTimeFormat("es-GT", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const byHour = Array.from({ length: Math.ceil((end.getTime() - start.getTime()) / hourMs) }, (_, index) => ({
    label: formatHour.format(new Date(start.getTime() + index * hourMs)), cents: 0,
  }));
  let salesCents = 0;
  const paidSessions = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.paidAt) continue;
    const amount = payment.subtotalCents + payment.taxCents;
    const index = Math.floor((payment.paidAt.getTime() - start.getTime()) / hourMs);
    byHour[index].cents += amount;
    salesCents += amount;
    paidSessions.set(payment.sessionId, payment.session.guestCount);
  }
  const paidDiners = [...paidSessions.values()].reduce((sum, guests) => sum + guests, 0);
  const response = attended._avg.responseTimeSeconds;
  return {
    date, byHour, salesCents, activeDiners: active._sum.guestCount ?? 0,
    averageTableCents: paidSessions.size ? Math.round(salesCents / paidSessions.size) : null,
    averageDinerCents: paidDiners ? Math.round(salesCents / paidDiners) : null,
    averageResponseSeconds: response === null ? null : Math.round(response),
  };
}

export async function readAdmin(restaurantId: string) {
  return prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { slug: true, name: true, currency: true, timeZone: true, wifiSsid: true, wifiPassword: true, taxBps: true },
    });
    const stats = await dailyStats(tx, restaurantId, restaurant.timeZone);
    const tables = await tx.diningTable.findMany({
      where: { restaurantId }, orderBy: { number: "asc" },
      select: { id: true, number: true, status: true, _count: { select: { sessions: true } } },
    });
    const categories = await tx.category.findMany({
      where: { restaurantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true, _count: { select: { items: true } } },
    });
    const stations = await tx.kitchenStation.findMany({
      where: { restaurantId }, orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { items: true, orderItems: true } } },
    });
    const products = await tx.menuItem.findMany({
      where: { restaurantId }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      select: {
        id: true, name: true, categoryId: true, stationId: true, description: true, imageUrl: true,
        priceCents: true, spiceLevel: true, tags: true, available: true,
        modifiers: {
          select: { name: true, kind: true, priceDeltaCents: true, available: true, tags: true },
          orderBy: [{ kind: "asc" }, { name: "asc" }],
        },
        _count: { select: { orderItems: true } },
      },
    });
    const questions = await tx.triviaQuestion.findMany({
      where: { restaurantId }, orderBy: { prompt: "asc" },
      select: { id: true, prompt: true, options: true, correctIndex: true, available: true, _count: { select: { rounds: true } } },
    });
    const activeRound = await tx.triviaRound.findFirst({
      where: { restaurantId, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
      select: { id: true, questionId: true, endsAt: true },
    });
    return {
      restaurant, categories, stations, products, questions, tables, activeRound,
      stats: { ...stats, occupiedTables: tables.filter(({ status }) => status === "ACTIVE").length, totalTables: tables.length },
    };
  }, { isolationLevel: "RepeatableRead" });
}

function productFields({ description, imageUrl, modifiers, ...fields }: z.infer<typeof adminProductSchema>) {
  return { fields: { ...fields, description: description ?? null, imageUrl: imageUrl ?? null }, modifiers };
}

async function createEntity(tx: Tx, restaurantId: string, input: z.infer<typeof createAdminSchema>) {
  switch (input.kind) {
    case "category": return tx.category.create({ data: { restaurantId, ...input.values } });
    case "station": return tx.kitchenStation.create({ data: { restaurantId, ...input.values } });
    case "question": return tx.triviaQuestion.create({ data: { restaurantId, ...input.values } });
    case "table": return tx.diningTable.create({
      data: { restaurantId, number: input.values.number, tableCode: `m${input.values.number}-${randomBytes(8).toString("hex")}` },
      select: { id: true },
    });
    case "product": {
      const { fields, modifiers } = productFields(input.values);
      return tx.menuItem.create({ data: { restaurantId, ...fields, modifiers: { create: modifiers } } });
    }
  }
}

async function lockTrivia(tx: Tx, restaurantId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Restaurant" WHERE "id" = ${restaurantId} FOR UPDATE`;
}

async function updateEntity(tx: Tx, restaurantId: string, input: z.infer<typeof updateAdminSchema>) {
  if (input.kind === "settings") return tx.restaurant.update({ where: { id: restaurantId }, data: input.values });
  const where = { restaurantId_id: { restaurantId, id: input.id } };
  switch (input.kind) {
    case "category": return tx.category.update({ where, data: input.values });
    case "station": return tx.kitchenStation.update({ where, data: input.values });
    case "table": {
      await lockTable(tx, { restaurantId, id: input.id });
      const table = await tx.diningTable.findUniqueOrThrow({ where, select: { status: true } });
      requireThat(table.status === "FREE", 409, "Cierra la sesión antes de editar la mesa.");
      return tx.diningTable.update({ where, data: input.values });
    }
    case "question": {
      await lockTrivia(tx, restaurantId);
      const question = await tx.triviaQuestion.findUniqueOrThrow({
        where, select: { prompt: true, options: true, correctIndex: true, _count: { select: { rounds: true } } },
      });
      const unchanged = question.prompt === input.values.prompt && question.correctIndex === input.values.correctIndex
        && JSON.stringify(question.options) === JSON.stringify(input.values.options);
      requireThat(unchanged || !question._count.rounds, 409, "Esta pregunta ya se usó. Puedes desactivarla y crear otra.");
      return tx.triviaQuestion.update({ where, data: input.values });
    }
    case "product": {
      const { fields, modifiers } = productFields(input.values);
      await tx.menuItem.update({ where, data: fields });
      await tx.menuModifier.deleteMany({
        where: {
          restaurantId, menuItemId: input.id,
          ...(modifiers.length ? { NOT: { OR: modifiers.map(({ kind, name }) => ({ kind, name })) } } : {}),
        },
      });
      for (const modifier of modifiers) {
        const key = { restaurantId, menuItemId: input.id, kind: modifier.kind, name: modifier.name };
        await tx.menuModifier.upsert({
          where: { restaurantId_menuItemId_kind_name: key },
          create: { ...key, ...modifier },
          update: { priceDeltaCents: modifier.priceDeltaCents, available: modifier.available, tags: modifier.tags },
        });
      }
      return { id: input.id };
    }
  }
}

async function removeEntity(tx: Tx, restaurantId: string, { kind, id }: z.infer<typeof deleteAdminSchema>) {
  const where = { restaurantId_id: { restaurantId, id } };
  switch (kind) {
    case "category":
      await tx.category.delete({ where });
      return false;
    case "station":
      await tx.kitchenStation.delete({ where });
      return false;
    case "table": {
      await lockTable(tx, { restaurantId, id });
      const table = await tx.diningTable.findUniqueOrThrow({ where, select: { status: true, _count: { select: { sessions: true } } } });
      requireThat(table.status === "FREE" && table._count.sessions === 0, 409, "Las mesas con historial de sesiones se conservan.");
      await tx.diningTable.delete({ where });
      return false;
    }
    case "product": {
      const product = await tx.menuItem.findUniqueOrThrow({ where, select: { _count: { select: { orderItems: true } } } });
      if (product._count.orderItems) {
        await tx.menuItem.update({ where, data: { available: false } });
        return true;
      }
      await tx.menuModifier.deleteMany({ where: { restaurantId, menuItemId: id } });
      await tx.menuItem.delete({ where });
      return false;
    }
    case "question": {
      await lockTrivia(tx, restaurantId);
      const question = await tx.triviaQuestion.findUniqueOrThrow({ where, select: { _count: { select: { rounds: true } } } });
      if (question._count.rounds) {
        await tx.triviaQuestion.update({ where, data: { available: false } });
        return true;
      }
      await tx.triviaQuestion.delete({ where });
      return false;
    }
  }
}

export async function changeAdmin(restaurantId: string, change: Change) {
  let archived = false;
  try {
    archived = await prisma.$transaction(async (tx) => {
      if (change.method === "remove") return removeEntity(tx, restaurantId, change.input);
      if (change.method === "create") await createEntity(tx, restaurantId, change.input);
      else await updateEntity(tx, restaurantId, change.input);
      return false;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    if (error.code === "P2002") throw new ApiError(409, "Ya existe un registro con ese nombre o número.");
    if (error.code === "P2003") throw new ApiError(409, "Hay registros relacionados. Reasigna los productos o conserva el historial.");
    if (error.code === "P2025") throw new ApiError(404, "Registro no encontrado en este restaurante.");
    throw error;
  }
  const topic = change.input.kind === "table" || change.input.kind === "settings" ? "session"
    : change.input.kind === "question" ? "trivia" : "catalog";
  publish(restaurantId, { topic });
  return { archived };
}
