import type { MenuTag } from "@prisma/client";
import { z } from "zod";

import { hostTokenSchema, restaurantParamsSchema } from "@/lib/validators";

export const credentialsSchema = restaurantParamsSchema.extend({ token: hostTokenSchema });
export type Credentials = z.infer<typeof credentialsSchema>;
export type Section = "kds" | "waiter" | "admin";
export type Restaurant = { name: string; currency: string };

export type Station = { id: string; name: string };
export type KitchenStatus = "NEW" | "PREPARING" | "READY";
export type KitchenItem = {
  id: string; stationId: string; name: string; quantity: number; notes: string | null;
  tags: MenuTag[]; modifiers: { name: string; kind: "SIZE" | "EXTRA"; tags: MenuTag[] }[];
};
export type Ticket = { orderId: string; tableNumber: number; guestCount: number; createdAt: string; items: KitchenItem[] };
export type KitchenData = { restaurant: Restaurant; stations: Station[]; columns: Record<KitchenStatus, Ticket[]> };

export type ServiceAlert = { id: string; createdAt: string };
export type PriorityAlert = ServiceAlert & { session: { id: string; guestCount: number; table: { id: string; number: number } } };
export type ReadyItem = { id: string; name: string; quantity: number; station: { name: string } };
export type PendingPayment = { id: string; totalCents: number; method: "CARD_ONLINE" | "CASH" | "POS_AT_TABLE"; createdAt: string };
export type WaiterTable = {
  id: string; number: number; status: "FREE" | "ACTIVE";
  active: {
    id: string; guestCount: number; createdAt: string; hasHost: boolean; alerts: ServiceAlert[];
    orders: { id: string; createdAt: string; items: ReadyItem[] }[];
    payments: PendingPayment[];
  } | null;
};
export type WaiterData = { restaurant: Restaurant; tables: WaiterTable[]; priorityAlerts: PriorityAlert[] };

export const menuTags: Record<MenuTag, string> = {
  DAIRY: "Lácteos", NUTS: "Nueces", SHELLFISH: "Mariscos", GLUTEN_FREE: "Sin gluten", VEGAN: "Vegano",
};
export const paymentNames: Record<PendingPayment["method"], string> = {
  CASH: "Efectivo", POS_AT_TABLE: "POS en mesa", CARD_ONLINE: "Tarjeta en línea",
};

export class StaffError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function errorMessage(error: unknown) {
  if (error instanceof StaffError) return error.message;
  if (error instanceof z.ZodError) return "Revisa los datos ingresados.";
  return "No se pudo conectar. Intenta de nuevo.";
}

export async function staffRequest<T>(credentials: Credentials, path: string, options?: {
  method: "POST" | "PATCH" | "DELETE"; body: unknown;
}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/staff/${credentials.restaurantId}/${path}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      ...(options ? { "Content-Type": "application/json" } : {}),
    },
    body: options ? JSON.stringify(options.body) : undefined,
    signal,
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new StaffError(typeof data?.error === "string" ? data.error : "No se pudo completar la solicitud.", response.status);
  }
  return data as T;
}
