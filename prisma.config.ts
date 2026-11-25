import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { defineConfig, env } from "prisma/config";

const config = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
};

// Permite validar y generar en entornos sin acceso a los binarios de Prisma.
export default defineConfig(
  process.env.PRISMA_USE_WASM === "1"
    ? {
        ...config,
        experimental: { adapter: true },
        engine: "js",
        adapter: async () => new PrismaPg({ connectionString: env("DATABASE_URL") }),
      }
    : config,
);
