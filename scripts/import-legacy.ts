import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { tableCodeSchema } from "../lib/validators";

function connection(value: string | undefined) {
  const url = z.url({ protocol: /^postgres(?:ql)?$/ }).safeParse(value);
  if (!url.success) throw new Error("Configura LEGACY_DATABASE_URL y DATABASE_URL con URLs de PostgreSQL.");
  const parsed = new URL(url.data);
  if (parsed.searchParams.get("schema") && parsed.searchParams.get("schema") !== "public") {
    throw new Error("La importación requiere el esquema public en ambas bases.");
  }
  return url.data;
}

type Restaurant = { id: string; slug: string; name: string; taxBps: number; wifiSsid: string; wifiPass: string; createdAt: Date };
type Category = { id: string; restaurantId: string; name: string; sortOrder: number; isActive: boolean };
type Station = { id: string; restaurantId: string; name: string };
type Table = { id: string; restaurantId: string; tableCode: string; displayName: string };
type Product = {
  id: string; restaurantId: string; categoryId: string; kitchenStationId: string | null;
  name: string; description: string; imageUrl: string | null; priceCents: number; spiceLevel: number;
  allergenMask: number; isActive: boolean;
};
type Variant = { id: string; productId: string; label: string; extraCents: number; isDefault: boolean };
type Question = {
  id: string; restaurantId: string; question: string; optionA: string; optionB: string;
  optionC: string; optionD: string; correctOption: string; isActive: boolean;
};

async function importLegacy() {
  const legacyUrl = connection(process.env.LEGACY_DATABASE_URL);
  const targetUrl = connection(process.env.DATABASE_URL);
  if (new URL(legacyUrl).pathname === new URL(targetUrl).pathname) {
    throw new Error("Usa un nombre de base distinto para el destino.");
  }

  const legacy = new PrismaClient({ adapter: new PrismaPg({ connectionString: legacyUrl }) });
  const target = new PrismaClient({ adapter: new PrismaPg({ connectionString: targetUrl }) });
  try {
    const data = await legacy.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return {
        restaurants: await tx.$queryRaw<Restaurant[]>`SELECT "id", "slug", "name", "taxBps", "wifiSsid", "wifiPass", "createdAt" FROM public.restaurants`,
        categories: await tx.$queryRaw<Category[]>`SELECT "id", "restaurantId", "name", "sortOrder", "isActive" FROM public.categories`,
        stations: await tx.$queryRaw<Station[]>`SELECT "id", "restaurantId", "name" FROM public.kitchen_stations`,
        tables: await tx.$queryRaw<Table[]>`SELECT "id", "restaurantId", "tableCode", "displayName" FROM public.tables ORDER BY "restaurantId", "displayName", "id"`,
        products: await tx.$queryRaw<Product[]>`SELECT "id", "restaurantId", "categoryId", "kitchenStationId", "name", "description", "imageUrl", "priceCents", "spiceLevel", "allergenMask", "isActive" FROM public.products`,
        variants: await tx.$queryRaw<Variant[]>`SELECT "id", "productId", "label", "extraCents", "isDefault" FROM public.product_variants`,
        questions: await tx.$queryRaw<Question[]>`SELECT "id", "restaurantId", "question", "optionA", "optionB", "optionC", "optionD", "correctOption", "isActive" FROM public.trivia_questions`,
      };
    }, { isolationLevel: "RepeatableRead", timeout: 30_000 });

    const slug = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    if (data.restaurants.length === 0 || data.restaurants.some((row) => !slug.safeParse(row.slug).success)) {
      throw new Error("El origen debe tener restaurantes con slug compatible con las rutas web.");
    }
    if (data.tables.some((row) => !tableCodeSchema.safeParse(row.tableCode).success)) {
      throw new Error("Hay códigos NFC incompatibles con la ruta actual. Revisa sus formatos antes de importar.");
    }

    const questions = data.questions.map(({ id, restaurantId, question, optionA, optionB, optionC, optionD, correctOption, isActive }) => {
      const options = [optionA, optionB, optionC, optionD];
      const answer = correctOption.trim();
      const letter = /^[A-D]$/i.test(answer) ? "ABCD".indexOf(answer.toUpperCase()) : -1;
      const correctIndex = letter >= 0 ? letter : options.indexOf(answer);
      if (correctIndex < 0) throw new Error("Alguna pregunta tiene un formato de respuesta distinto de A–D o del texto de una opción.");
      return { id, restaurantId, prompt: question, options, correctIndex, available: isActive };
    });
    const categories = new Map(data.categories.map((category) => [category.id, category]));
    const products = new Map(data.products.map((product) => [product.id, product]));
    const nextNumber = new Map<string, number>();
    let unavailable = 0;

    await target.$transaction(async (tx) => {
      // A second process cannot import into the same target concurrently.
      await tx.$executeRaw`LOCK TABLE public."Restaurant" IN SHARE ROW EXCLUSIVE MODE`;
      if (await tx.restaurant.count()) throw new Error("El destino debe estar recién migrado y sin restaurantes. Ejecuta la importación antes del seed.");
      if (await tx.$queryRaw<{ found: boolean }[]>`
        SELECT to_regclass('public.restaurants') IS NOT NULL AS found
      `.then(([row]) => row.found)) {
        throw new Error("El destino contiene tablas del sistema anterior. Usa una base nueva.");
      }
      await tx.restaurant.createMany({
        data: data.restaurants.map(({ wifiPass, ...rest }) => ({ ...rest, wifiPassword: wifiPass || null })),
      });
      await tx.category.createMany({ data: data.categories.map(({ isActive: _isActive, ...category }) => category) });
      await tx.kitchenStation.createMany({ data: data.stations });
      const fallback = new Map<string, string>();
      for (const restaurantId of new Set(data.products.filter((product) => !product.kitchenStationId).map((product) => product.restaurantId))) {
        const usedNames = new Set(data.stations.filter((station) => station.restaurantId === restaurantId).map((station) => station.name));
        let name = "Sin estación";
        for (let suffix = 2; usedNames.has(name); suffix++) name = `Sin estación (${suffix})`;
        const station = await tx.kitchenStation.create({ data: { restaurantId, name } });
        fallback.set(restaurantId, station.id);
      }
      await tx.diningTable.createMany({
        data: data.tables.map(({ id, restaurantId, tableCode }) => {
          const number = (nextNumber.get(restaurantId) ?? 0) + 1;
          nextNumber.set(restaurantId, number);
          return { id, restaurantId, tableCode, number };
        }),
      });
      await tx.menuItem.createMany({
        data: data.products.map(({ kitchenStationId, allergenMask, isActive, ...product }) => {
          const stationId = kitchenStationId ?? fallback.get(product.restaurantId);
          if (!stationId) throw new Error("Un producto no tiene estación de destino.");
          const available = isActive && categories.get(product.categoryId)?.isActive === true && allergenMask === 0;
          if (!available && isActive && allergenMask !== 0) unavailable++;
          return { ...product, stationId, available };
        }),
      });
      await tx.menuModifier.createMany({
        data: data.variants.map(({ id, productId, label, extraCents }) => {
          const product = products.get(productId);
          if (!product) throw new Error("Existe una variante sin producto.");
          return { id, restaurantId: product.restaurantId, menuItemId: productId, name: label, kind: "SIZE", priceDeltaCents: extraCents };
        }),
      });
      await tx.triviaQuestion.createMany({ data: questions });
    }, { timeout: 60_000 });
    console.log(`Importados ${data.restaurants.length} restaurantes, ${data.tables.length} mesas, ${data.products.length} productos y ${questions.length} preguntas.`);
    console.log(`Productos activos en origen desactivados por máscara de alérgenos pendiente de revisión: ${unavailable}.`);
  } finally {
    await Promise.all([legacy.$disconnect(), target.$disconnect()]);
  }
}

importLegacy().catch((error: unknown) => {
  if (error instanceof Error && error.name === "Error") console.error(error.message);
  else if (error && typeof error === "object" && "code" in error) console.error("PostgreSQL rechazó la importación. Código:", error.code);
  else console.error("No se pudo importar. Comprueba las conexiones y que el destino tenga las migraciones aplicadas.");
  process.exitCode = 1;
});
