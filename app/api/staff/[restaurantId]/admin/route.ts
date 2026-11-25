import { createAdminSchema, deleteAdminSchema, updateAdminSchema } from "@/lib/admin-validation";
import { changeAdmin, readAdmin } from "@/lib/operations/admin";
import { readBody, staffRoute } from "@/lib/operations/http";

export const GET = staffRoute(["ADMIN"], (_request, restaurantId) => readAdmin(restaurantId));

export const POST = staffRoute(["ADMIN"], async (request, restaurantId) =>
  changeAdmin(restaurantId, { method: "create", input: await readBody(request, createAdminSchema) }));

export const PATCH = staffRoute(["ADMIN"], async (request, restaurantId) =>
  changeAdmin(restaurantId, { method: "update", input: await readBody(request, updateAdminSchema) }));

export const DELETE = staffRoute(["ADMIN"], async (request, restaurantId) =>
  changeAdmin(restaurantId, { method: "remove", input: await readBody(request, deleteAdminSchema) }));
