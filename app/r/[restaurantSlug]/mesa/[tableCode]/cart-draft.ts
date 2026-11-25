import { z } from "zod";

import { orderLineSchema } from "@/lib/validators";

const draftSchema = z.object({
  sessionId: z.string(),
  requestId: z.uuid(),
  lines: z.array(orderLineSchema.extend({ id: z.uuid(), name: z.string().max(120) })).min(1).max(30),
});
export type Draft = z.infer<typeof draftSchema>;

export function readDraft(key: string, sessionId: string) {
  try {
    const parsed = draftSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
    if (parsed.success && parsed.data.sessionId === sessionId) return parsed.data;
  } catch {
    // Storage may be blocked or hold an invalid value.
  }
  return null;
}

export function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(key, JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  } catch {
    // The cart remains usable in memory.
  }
}
