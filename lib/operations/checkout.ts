import "server-only";

import type { Payment, Prisma, TableSession } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/prisma";
import type { checkoutQuoteSchema, checkoutSchema, paymentDecisionSchema } from "@/lib/validators";

import { requireThat } from "./http";
import { moneyInt, roundedRate } from "./orders";
import { publish } from "./realtime";
import { sendReceipt } from "./receipts";
import { freeTable, lockTable, withActiveTable, withHost, type TableKey } from "./sessions";

type Tx = Prisma.TransactionClient;
type Quote = z.infer<typeof checkoutQuoteSchema>;
type Checkout = z.infer<typeof checkoutSchema>;

function baseCents(payment: { subtotalCents: number; taxCents: number }) {
  return payment.subtotalCents + payment.taxCents;
}

async function readLedger(tx: Tx, session: TableSession) {
  const where = { restaurantId: session.restaurantId, sessionId: session.id };
  const [orders, payments] = await Promise.all([
    tx.order.findMany({
      where,
      select: {
        subtotalCents: true, taxCents: true,
        items: {
          orderBy: { id: "asc" },
          select: { id: true, quantity: true, unitPriceCents: true, subtotalCents: true },
        },
      },
    }),
    tx.payment.findMany({
      where: { ...where, status: { not: "CANCELLED" } },
      select: {
        id: true, status: true, equalPartySize: true, equalShareIndex: true,
        subtotalCents: true, taxCents: true,
        allocations: { select: { orderItemId: true, quantity: true } },
      },
    }),
  ]);
  const subtotalCents = orders.reduce((sum, order) => sum + order.subtotalCents, 0);
  const taxCents = orders.reduce((sum, order) => sum + order.taxCents, 0);
  const paid = payments.filter(({ status }) => status === "PAID");
  const remainingSubtotal = subtotalCents - paid.reduce((sum, payment) => sum + payment.subtotalCents, 0);
  const remainingTax = taxCents - paid.reduce((sum, payment) => sum + payment.taxCents, 0);
  return { orders, payments, subtotalCents, taxCents, remainingSubtotal, remainingTax };
}

function share(cents: number, count: number, index: number) {
  return Math.floor(cents / count) + Number(index < cents % count);
}

function itemAllocation(ledger: Awaited<ReturnType<typeof readLedger>>, selections: { orderItemId: string; quantity: number }[]) {
  const quantities = new Map(selections.map(({ orderItemId, quantity }) => [orderItemId, quantity]));
  const paidQuantities = new Map<string, number>();
  for (const payment of ledger.payments) {
    for (const { orderItemId, quantity } of payment.allocations) {
      paidQuantities.set(orderItemId, (paidQuantities.get(orderItemId) ?? 0) + quantity);
    }
  }

  const allocations = [];
  for (const order of ledger.orders) {
    let offset = 0;
    const taxAt = (subtotal: number) => order.subtotalCents === 0 ? 0
      : Number(BigInt(order.taxCents) * BigInt(subtotal) / BigInt(order.subtotalCents));
    for (const item of order.items) {
      const quantity = quantities.get(item.id);
      if (quantity) {
        const paidQuantity = paidQuantities.get(item.id) ?? 0;
        requireThat(quantity + paidQuantity <= item.quantity, 409, "La cantidad supera el saldo de ese platillo");
        const start = offset + paidQuantity * item.unitPriceCents;
        const subtotalCents = quantity * item.unitPriceCents;
        allocations.push({ orderItemId: item.id, quantity, subtotalCents, taxCents: taxAt(start + subtotalCents) - taxAt(start) });
      }
      offset += item.subtotalCents;
    }
  }
  requireThat(allocations.length === selections.length, 422, "Algún platillo no pertenece a la cuenta");
  return allocations;
}

function priceCheckout(ledger: Awaited<ReturnType<typeof readLedger>>, { split, tip }: Quote) {
  requireThat(!ledger.payments.some(({ status }) => status === "PENDING"), 409, "Ya existe un pago pendiente");
  let subtotalCents = ledger.remainingSubtotal;
  let taxCents = ledger.remainingTax;
  let equalPartySize: number | undefined;
  let equalShareIndex: number | undefined;
  let allocations: ReturnType<typeof itemAllocation> = [];
  const equalPlan = ledger.payments.find((payment) => payment.equalPartySize !== null);

  if (split.kind === "EQUAL") {
    requireThat(!ledger.payments.some(({ equalPartySize }) => equalPartySize !== split.partySize),
      409, "Mantén el número de partes de la división en curso");
    requireThat(!ledger.payments.some(({ equalShareIndex }) => equalShareIndex === split.shareIndex),
      409, "Esta parte ya fue pagada");
    equalPartySize = split.partySize;
    equalShareIndex = split.shareIndex;
    subtotalCents = share(ledger.subtotalCents, equalPartySize, equalShareIndex);
    taxCents = share(ledger.subtotalCents + ledger.taxCents, equalPartySize, equalShareIndex) - subtotalCents;
  }

  if (split.kind === "ITEMS") {
    requireThat(!equalPlan, 409, "Ya se inició una división en partes iguales");
    allocations = itemAllocation(ledger, split.items);
    subtotalCents = allocations.reduce((sum, item) => sum + item.subtotalCents, 0);
    taxCents = allocations.reduce((sum, item) => sum + item.taxCents, 0);
  }

  const amount = moneyInt(subtotalCents + taxCents);
  const tipCents = tip.kind === "CUSTOM" ? tip.tipCents : roundedRate(amount, tip.percent * 100);
  const totals = { subtotalCents, taxCents, tipCents, totalCents: moneyInt(amount + tipCents) };
  return { ...totals, equalPartySize, equalShareIndex, allocations };
}

export async function quoteCheckout(request: Request, table: TableKey, input: Quote) {
  return withHost(request, table, input.sessionId, async (tx, session) =>
    priceCheckout(await readLedger(tx, session), input));
}

async function finishPaid(tx: Tx, session: TableSession, payment: Payment, remainingBase: number, now: Date) {
  const closed = baseCents(payment) === remainingBase;
  if (closed) await freeTable(tx, session, now);
  const currency = payment.receiptEmail ? (await tx.restaurant.findUniqueOrThrow({
    where: { id: session.restaurantId }, select: { currency: true },
  })).currency : null;
  const receipt = payment.receiptEmail && currency ? {
    paymentId: payment.id, email: payment.receiptEmail, totalCents: payment.totalCents, currency,
  } : null;
  return { closed, receipt };
}

function publicPayment(payment: Payment) {
  const { id, sessionId, method, status, subtotalCents, taxCents, tipCents, totalCents, equalPartySize,
    equalShareIndex, paidAt } = payment;
  return { id, sessionId, method, status, subtotalCents, taxCents, tipCents, totalCents, equalPartySize,
    equalShareIndex, paidAt };
}

async function notifyCheckout(table: TableKey, result: {
  closed: boolean;
  receipt: Parameters<typeof sendReceipt>[0] | null;
}) {
  publish(table.restaurantId, { topic: "checkout", tableId: table.id });
  if (result.closed) publish(table.restaurantId, { topic: "session", tableId: table.id });
  if (result.receipt) {
    try {
      await sendReceipt(result.receipt);
    } catch {
      console.error("No se pudo emitir el recibo", result.receipt.paymentId);
    }
  }
}

export async function createPayment(request: Request, table: TableKey, input: Checkout) {
  const { restaurantId } = table;
  const result = await withHost(request, table, input.sessionId, async (tx, session) => {
    const key = { restaurantId, sessionId: session.id, requestId: input.requestId };
    const existing = await tx.payment.findUnique({ where: { restaurantId_sessionId_requestId: key } });
    if (existing) return { payment: existing, closed: false, receipt: null, changed: false };

    const ledger = await readLedger(tx, session);
    const { allocations, ...pricing } = priceCheckout(ledger, input);
    const now = new Date();
    const online = input.method === "CARD_ONLINE";
    const payment = await tx.payment.create({
      data: {
        ...key, ...pricing, method: input.method, status: online ? "PAID" : "PENDING",
        receiptEmail: input.receiptEmail, paidAt: online ? now : null,
        allocations: { create: allocations },
      },
    });
    if (input.review) {
      const reviewKey = { restaurantId, sessionId: session.id };
      await tx.sessionReview.upsert({
        where: { restaurantId_sessionId: reviewKey },
        create: { ...reviewKey, ...input.review },
        update: { ...input.review, comment: input.review.comment ?? null },
      });
    }

    const completion = online
      ? await finishPaid(tx, session, payment, ledger.remainingSubtotal + ledger.remainingTax, now)
      : { closed: false, receipt: null };
    return { payment, ...completion, changed: true };
  });

  if (result.changed) await notifyCheckout(table, result);
  return { payment: publicPayment(result.payment), closed: result.closed };
}

export async function decidePayment(restaurantId: string, input: z.infer<typeof paymentDecisionSchema>) {
  const where = { restaurantId_id: { restaurantId, id: input.paymentId } };
  const lookup = await prisma.payment.findUnique({
    where, select: { session: { select: { tableId: true } } },
  });
  requireThat(lookup, 404, "Pago no encontrado");

  const status = input.decision === "CONFIRM" ? "PAID" : "CANCELLED";
  const table = { restaurantId, id: lookup.session.tableId };
  const result = await prisma.$transaction(async (tx) => {
    await lockTable(tx, table);
    const { session, ...current } = await tx.payment.findUniqueOrThrow({ where, include: { session: true } });
    if (current.status === status) {
      return { payment: current, closed: session.status === "CLOSED", receipt: null, changed: false };
    }
    requireThat(session.status === "ACTIVE" && current.status === "PENDING", 409, "El pago ya se procesó o la mesa cerró");

    const ledger = await readLedger(tx, session);
    const now = new Date();
    const payment = await tx.payment.update({ where, data: { status, paidAt: status === "PAID" ? now : null } });
    const completion = status === "PAID"
      ? await finishPaid(tx, session, payment, ledger.remainingSubtotal + ledger.remainingTax, now)
      : { closed: false, receipt: null };
    return { payment, ...completion, changed: true };
  });

  if (result.changed) await notifyCheckout(table, result);
  return { payment: publicPayment(result.payment), closed: result.closed };
}

export async function closeTable(table: TableKey, sessionId: string, confirmUnpaid: boolean) {
  await withActiveTable(table, sessionId, async (tx, session) => {
    const ledger = await readLedger(tx, session);
    requireThat(!ledger.payments.some(({ status }) => status === "PENDING"), 409, "Resuelve el pago pendiente antes de cerrar");
    requireThat(confirmUnpaid || ledger.remainingSubtotal + ledger.remainingTax === 0, 409, "La cuenta tiene saldo pendiente");
    await freeTable(tx, session, new Date());
  });
  publish(table.restaurantId, { topic: "session", tableId: table.id });
  return { closed: true };
}
