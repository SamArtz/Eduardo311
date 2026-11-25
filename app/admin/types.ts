import type { z } from "zod";

import type { createAdminSchema } from "@/lib/admin-validation";
import type { readAdmin } from "@/lib/operations/admin";

type ServerData = Awaited<ReturnType<typeof readAdmin>>;
export type AdminData = Omit<ServerData, "activeRound"> & {
  activeRound: { id: string; questionId: string; endsAt: string } | null;
};
export type CreateInput = z.infer<typeof createAdminSchema>;
export type Resource = CreateInput["kind"];
export type RecordByResource = {
  category: AdminData["categories"][number];
  station: AdminData["stations"][number];
  product: AdminData["products"][number];
  question: AdminData["questions"][number];
  table: AdminData["tables"][number];
};
export type EditorTarget = { [K in Resource]: { kind: K; record?: RecordByResource[K] } }[Resource];
export type ModifierInput = RecordByResource["product"]["modifiers"][number];

export const resourceLabels: Record<Resource, { singular: string; create: string }> = {
  product: { singular: "producto", create: "Nuevo producto" },
  category: { singular: "categoría", create: "Nueva categoría" },
  station: { singular: "estación", create: "Nueva estación" },
  question: { singular: "pregunta", create: "Nueva pregunta" },
  table: { singular: "mesa", create: "Nueva mesa" },
};
