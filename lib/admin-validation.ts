import { z } from "zod";

import {
  categorySchema, diningTableSchema, menuItemSchema, restaurantSettingsSchema,
  sessionActionSchema, stationSchema, triviaQuestionSchema,
} from "./validators";

const entityId = sessionActionSchema.shape.sessionId;

export const adminProductSchema = menuItemSchema.extend({
  imageUrl: z.union([
    menuItemSchema.shape.imageUrl.unwrap(),
    z.string().max(2048).regex(/^\/(?!\/)[a-zA-Z0-9_./-]+$/),
  ]).optional(),
});

export const tableNumberSchema = diningTableSchema.pick({ number: true });

export const createAdminSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("category"), values: categorySchema }),
  z.strictObject({ kind: z.literal("station"), values: stationSchema }),
  z.strictObject({ kind: z.literal("product"), values: adminProductSchema }),
  z.strictObject({ kind: z.literal("question"), values: triviaQuestionSchema }),
  z.strictObject({ kind: z.literal("table"), values: tableNumberSchema }),
]);

export const updateAdminSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("category"), id: entityId, values: categorySchema }),
  z.strictObject({ kind: z.literal("station"), id: entityId, values: stationSchema }),
  z.strictObject({ kind: z.literal("product"), id: entityId, values: adminProductSchema }),
  z.strictObject({ kind: z.literal("question"), id: entityId, values: triviaQuestionSchema }),
  z.strictObject({ kind: z.literal("table"), id: entityId, values: tableNumberSchema }),
  z.strictObject({ kind: z.literal("settings"), values: restaurantSettingsSchema }),
]);

export const deleteAdminSchema = z.strictObject({
  kind: z.enum(["category", "station", "product", "question", "table"]),
  id: entityId,
});
