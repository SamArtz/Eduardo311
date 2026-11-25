import type { MenuTag, OrderStatus } from "@prisma/client";
import type { z } from "zod";

import type { checkoutQuoteSchema, checkoutSchema, createOrderSchema } from "@/lib/validators";

export type Modifier = {
  id: string;
  name: string;
  kind: "SIZE" | "EXTRA";
  priceDeltaCents: number;
  tags: MenuTag[];
};

export type Dish = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  spiceLevel: number;
  tags: MenuTag[];
  modifiers: Modifier[];
};

export type Category = { id: string; name: string; items: Dish[] };
export type CartLine = { id: string; dish: Dish; modifiers: Modifier[]; quantity: number; notes: string };
export type OrderInput = z.input<typeof createOrderSchema>;
export type QuoteInput = z.input<typeof checkoutQuoteSchema>;
export type PayInput = z.input<typeof checkoutSchema>;

type OrderLine = {
  id: string;
  name: string;
  quantity: number;
  status: OrderStatus;
  unitPriceCents?: number;
  notes?: string | null;
  modifiers?: Pick<Modifier, "name" | "kind">[];
};

export type Order = {
  id: string;
  createdAt: string;
  items: OrderLine[];
  subtotalCents?: number;
  taxCents?: number;
  totalCents?: number;
};

export type Session = {
  id: string;
  guestCount: number;
  createdAt: string;
  role: "HOST" | "GUEST";
  canClaim: boolean;
  hostName?: string | null;
};

export type Alert = {
  id: string;
  createdAt: string;
  resolvedAt: string | null;
  cancelledAt: string | null;
  responseTimeSeconds: number | null;
};

export type Quote = { subtotalCents: number; taxCents: number; tipCents: number; totalCents: number };

export type Payment = Quote & {
  id: string;
  method: PayInput["method"];
  status: "PAID" | "PENDING" | "CANCELLED";
  equalPartySize: number | null;
  equalShareIndex: number | null;
  allocations?: { orderItemId: string; quantity: number }[];
};

export type Active = { session: Session; orders: Order[]; alert: Alert | null; payments?: Payment[] };

export type Snapshot = {
  restaurant: {
    id: string;
    name: string;
    currency: string;
    wifiSsid: string | null;
    wifiPassword: string | null;
  };
  table: { id: string; number: number; status: "FREE" | "ACTIVE" };
  active: Active | null;
};

type Question = { prompt: string; options: string[] };

export type Trivia = {
  active: { id: string; endsAt: string; question: Question; selectedOptionIndex: number | null } | null;
  lastRound: { id: string; question: Question & { correctIndex: number } } | null;
  leaderboard: { tableNumber: number; points: number }[];
  serverTime: string;
};

export const tagLabels: Record<MenuTag, string> = {
  GLUTEN_FREE: "Sin gluten", DAIRY: "Lácteos", NUTS: "Nueces", SHELLFISH: "Mariscos", VEGAN: "Vegano",
};

export const paymentLabels: Record<PayInput["method"], string> = {
  CARD_ONLINE: "Tarjeta en línea (simulación)", POS_AT_TABLE: "POS en mesa", CASH: "Efectivo",
};

export class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function tableRequest<T>(path: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
  const { token, body } = options;
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      ...(token ? { "X-Host-Token": token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new RequestError(typeof data?.error === "string" ? data.error : "No se pudo completar la solicitud.", response.status);
  }
  return data as T;
}

export function message(error: unknown) {
  if (error instanceof RequestError) return error.message;
  if (error instanceof Error && error.name === "ZodError") return "Revisa los datos ingresados y vuelve a intentarlo.";
  return "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
}

export function requestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

export function lineTotal({ dish, modifiers, quantity }: CartLine) {
  return (dish.priceCents + modifiers.reduce((sum, modifier) => sum + modifier.priceDeltaCents, 0)) * quantity;
}
