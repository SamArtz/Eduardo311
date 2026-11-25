import { z } from "zod";

const identifier = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const urlSegment = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const label = z.string().trim().min(1).max(120);
const cents = z.int().min(0).max(100_000);
const guestCount = z.int().min(1).max(20);
const menuTags = z.array(z.enum(["GLUTEN_FREE", "DAIRY", "NUTS", "SHELLFISH", "VEGAN"]))
  .max(5)
  .refine((tags) => new Set(tags).size === tags.length, "Hay etiquetas repetidas");

export const restaurantParamsSchema = z.strictObject({ restaurantId: identifier });
export const tableParamsSchema = z.strictObject({ restaurantSlug: urlSegment, tableCode: urlSegment });
export const hostTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const startSessionSchema = z.strictObject({
  guestCount,
  hostName: z.string().trim().min(1).max(80).optional(),
});

export const sessionActionSchema = z.strictObject({ sessionId: identifier });
export const resolveAlertSchema = z.strictObject({ alertId: identifier });

export const orderLineSchema = z.strictObject({
  menuItemId: identifier,
  quantity: z.int().min(1).max(20),
  modifierIds: z.array(identifier).max(12)
    .refine((ids) => new Set(ids).size === ids.length, "Hay modificadores repetidos"),
  notes: z.string().trim().max(300).optional(),
});

export const createOrderSchema = sessionActionSchema.extend({
  requestId: z.uuid(),
  items: z.array(orderLineSchema).min(1).max(30),
});

export const updateKitchenItemSchema = z.strictObject({
  orderItemId: identifier,
  status: z.enum(["PREPARING", "READY", "DELIVERED"]),
});

const itemSelection = z.strictObject({
  orderItemId: identifier,
  quantity: z.int().min(1).max(20),
});

export const checkoutSplitSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("FULL") }),
  z.strictObject({
    kind: z.literal("EQUAL"),
    partySize: guestCount,
    shareIndex: z.int().min(0).max(19),
  }).refine(({ partySize, shareIndex }) => shareIndex < partySize, {
    path: ["shareIndex"],
    message: "La parte debe corresponder a un comensal",
  }),
  z.strictObject({
    kind: z.literal("ITEMS"),
    items: z.array(itemSelection).min(1).max(100).refine(
      (items) => new Set(items.map(({ orderItemId }) => orderItemId)).size === items.length,
      "Hay ítems repetidos",
    ),
  }),
]);

export const reviewSchema = z.strictObject({
  stars: z.int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

export const checkoutSchema = sessionActionSchema.extend({
  requestId: z.uuid(),
  split: checkoutSplitSchema,
  tip: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("PERCENT"), percent: z.union([z.literal(0), z.literal(10), z.literal(15)]) }),
    z.strictObject({ kind: z.literal("CUSTOM"), tipCents: cents }),
  ]),
  method: z.enum(["CARD_ONLINE", "POS_AT_TABLE", "CASH"]),
  receiptEmail: z.email().max(254).optional(),
  review: reviewSchema.optional(),
});

export const categorySchema = z.strictObject({
  name: label,
  sortOrder: z.int().min(0).max(1000),
});

export const stationSchema = z.strictObject({ name: label });

export const menuModifierSchema = z.strictObject({
  kind: z.enum(["SIZE", "EXTRA"]),
  name: label,
  priceDeltaCents: cents,
  tags: menuTags,
  available: z.boolean(),
});

export const menuItemSchema = z.strictObject({
  categoryId: identifier,
  stationId: identifier,
  name: label,
  description: z.string().trim().max(1000).optional(),
  imageUrl: z.url({ protocol: /^https?$/ }).max(2048).optional(),
  priceCents: cents,
  spiceLevel: z.int().min(0).max(5),
  tags: menuTags,
  available: z.boolean(),
  modifiers: z.array(menuModifierSchema).max(30).refine(
    (options) => new Set(options.map(({ kind, name }) => JSON.stringify([kind, name]))).size === options.length,
    "Hay modificadores repetidos",
  ),
});

export const diningTableSchema = z.strictObject({
  number: z.int().min(1).max(9999),
  tableCode: urlSegment,
});

export const restaurantSettingsSchema = z.strictObject({
  wifiSsid: z.string().min(1).max(32).nullable(),
  wifiPassword: z.string().max(63).nullable(),
  taxBps: z.int().min(0).max(10_000),
});

export const triviaQuestionSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(300),
  options: z.array(label).min(2).max(6).refine(
    (options) => new Set(options).size === options.length,
    "Hay respuestas repetidas",
  ),
  correctIndex: z.int().min(0).max(5),
  available: z.boolean(),
}).refine(({ options, correctIndex }) => correctIndex < options.length, {
  path: ["correctIndex"],
  message: "Selecciona una opción existente",
});

export const triviaAnswerSchema = sessionActionSchema.extend({
  roundId: identifier,
  optionIndex: z.int().min(0).max(5),
});

export const claimSessionSchema = startSessionSchema.partial();
export const tableCodeSchema = urlSegment;
export const tableActionSchema = z.strictObject({ tableId: identifier, sessionId: identifier });
export const closeTableSchema = tableActionSchema.extend({ confirmUnpaid: z.boolean().default(false) });
export const kdsQuerySchema = z.strictObject({ stationId: identifier.optional() });
export const waiterQuerySchema = z.strictObject({
  filter: z.enum(["ALL", "ALERT", "READY", "ACTIVE", "FREE"]).default("ALL"),
});
export const paymentDecisionSchema = z.strictObject({
  paymentId: identifier,
  decision: z.enum(["CONFIRM", "CANCEL"]),
});
export const startTriviaRoundSchema = z.strictObject({
  questionId: identifier,
  durationSeconds: z.int().min(5).max(300),
});
export const checkoutQuoteSchema = checkoutSchema.pick({ sessionId: true, split: true, tip: true });
