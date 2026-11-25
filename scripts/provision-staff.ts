import "dotenv/config";

import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const args = z.tuple([
  z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  z.enum(["ADMIN", "KITCHEN", "WAITER"]),
]).safeParse(process.argv.slice(2));

const connectionString = process.env.DATABASE_URL;
if (!args.success || !connectionString) {
  console.error("Configura DATABASE_URL y ejecuta npm run staff:token -- <restaurantSlug> <ADMIN|KITCHEN|WAITER>");
  process.exit(1);
}

const [slug, role] = args.data;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function provision() {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug }, select: { id: true },
  });
  if (!restaurant) throw new Error("Restaurante no encontrado");

  const token = randomBytes(32).toString("base64url");
  const identityId = createHash("sha256").update(token).digest("hex");
  await prisma.staffMembership.create({
    data: { restaurantId: restaurant.id, identityId, role },
  });
  console.log(JSON.stringify({ restaurantId: restaurant.id, role, token }));
}

provision()
  .catch((error: unknown) => {
    console.error(error instanceof Error && error.message === "Restaurante no encontrado"
      ? error.message
      : "No se pudo provisionar la credencial del personal");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
