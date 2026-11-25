import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { StaffRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { hostTokenSchema, restaurantParamsSchema, tableParamsSchema } from "@/lib/validators";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function requireThat<T>(value: T, status: number, message: string): asserts value {
  if (!value) throw new ApiError(status, message);
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ApiError(400, "JSON inválido");
  }
  return parse(schema, input);
}

const noStore = { "Cache-Control": "no-store" };

type Context<T> = { params: Promise<T> };

export function route<T>(
  handler: (request: Request, params: T) => Promise<unknown>,
) {
  return async (request: Request, context: Context<T>): Promise<Response> => {
    try {
      const result = await handler(request, await context.params);
      return result instanceof Response ? result : Response.json(result, { headers: noStore });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({
          error: "Datos inválidos",
          issues: error.issues.map(({ path, message }) => ({ path, message })),
        }, { status: 400, headers: noStore });
      }
      if (error instanceof ApiError) {
        return Response.json({ error: error.message }, { status: error.status, headers: noStore });
      }
      console.error("Error de API", error instanceof Error ? error.name : "Error desconocido");
      return Response.json({ error: "Error interno" }, { status: 500, headers: noStore });
    }
  };
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function guestToken() {
  return randomBytes(32).toString("base64url");
}

export function readHostToken(request: Request) {
  return hostTokenSchema.safeParse(request.headers.get("X-Host-Token")).data;
}

export async function requireStaff(request: Request, restaurantId: string, roles: StaffRole[]) {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1];
  requireThat(token, 401, "Se requiere autenticación del personal");
  const membership = await prisma.staffMembership.findFirst({
    where: { restaurantId, identityId: tokenHash(token), role: { in: roles } },
    select: { role: true },
  });
  requireThat(membership, 403, "Permisos insuficientes para este restaurante");
}

export type TableParams = z.infer<typeof tableParamsSchema>;
export type RestaurantParams = z.infer<typeof restaurantParamsSchema>;

export function guestRoute(handler: (request: Request, params: TableParams) => Promise<unknown>) {
  return route<TableParams>((request, params) => handler(request, parse(tableParamsSchema, params)));
}

export function restaurantRoute(handler: (request: Request, params: RestaurantParams) => Promise<unknown>) {
  return route<RestaurantParams>((request, params) => handler(request, parse(restaurantParamsSchema, params)));
}

export function staffRoute(roles: StaffRole[], handler: (request: Request, restaurantId: string) => Promise<unknown>) {
  return restaurantRoute(async (request, { restaurantId }) => {
    await requireStaff(request, restaurantId, roles);
    return handler(request, restaurantId);
  });
}
