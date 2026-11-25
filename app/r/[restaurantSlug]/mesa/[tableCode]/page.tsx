import { notFound } from "next/navigation";

import { tableParamsSchema } from "@/lib/validators";

import { Mesa } from "./mesa";

type Params = { restaurantSlug: string; tableCode: string };

export default async function TablePage({ params }: { params: Promise<Params> }) {
  const parsed = tableParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  return <Mesa key={`${parsed.data.restaurantSlug}/${parsed.data.tableCode}`} {...parsed.data} />;
}
