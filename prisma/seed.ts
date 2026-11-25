import { randomBytes } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type MenuTag, type ModifierKind } from "@prisma/client";

import { streetCategories, streetProducts, type StreetCategory } from "./street-menu";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Configura DATABASE_URL en .env");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const stations = {
  grill: "Parrilla",
  cold: "Cocina Fría",
  drinks: "Bebidas",
} as const;

const categories = {
  starters: "Entradas",
  mains: "Platos fuertes",
  drinks: "Bebidas",
} as const;

type Modifier = { kind: ModifierKind; name: string; priceDeltaCents: number; tags: MenuTag[] };

const large: Modifier = { kind: "SIZE", name: "Grande", priceDeltaCents: 1000, tags: [] };
const extraAvocado: Modifier = { kind: "EXTRA", name: "Aguacate", priceDeltaCents: 900, tags: [] };
const extraCheese: Modifier = { kind: "EXTRA", name: "Queso fresco", priceDeltaCents: 700, tags: ["DAIRY"] };

type Dish = {
  imageUrl?: string | null;
  name: string;
  description: string;
  category: keyof typeof categories | StreetCategory;
  station: keyof typeof stations;
  priceCents: number;
  spiceLevel: number;
  tags: MenuTag[];
  modifiers: Modifier[];
};

const dishes: Dish[] = [
  { name: "Guacamole de la casa", description: "Aguacate, cilantro y limón con totopos.", category: "starters", station: "cold", priceCents: 3200, spiceLevel: 1, tags: ["GLUTEN_FREE", "VEGAN"], modifiers: [large] },
  { name: "Tostadas de frijol", description: "Frijoles negros, queso fresco y cebolla.", category: "starters", station: "cold", priceCents: 2900, spiceLevel: 0, tags: ["DAIRY", "GLUTEN_FREE"], modifiers: [extraAvocado] },
  { name: "Ceviche de camarón", description: "Camarón, tomate, cebolla y cítricos.", category: "starters", station: "cold", priceCents: 5800, spiceLevel: 2, tags: ["SHELLFISH", "GLUTEN_FREE"], modifiers: [large] },
  { name: "Ensalada de pepitoria", description: "Hojas tiernas, almendras y pepitoria tostada.", category: "starters", station: "cold", priceCents: 4500, spiceLevel: 0, tags: ["NUTS", "VEGAN", "GLUTEN_FREE"], modifiers: [extraCheese] },
  { name: "Pollo a la parrilla", description: "Pollo marinado, arroz y vegetales.", category: "mains", station: "grill", priceCents: 6900, spiceLevel: 1, tags: ["GLUTEN_FREE"], modifiers: [extraAvocado] },
  { name: "Tacos de res", description: "Tres tortillas de maíz con res y salsa asada.", category: "mains", station: "grill", priceCents: 6200, spiceLevel: 3, tags: ["GLUTEN_FREE"], modifiers: [extraCheese] },
  { name: "Vegetales asados", description: "Vegetales de temporada con frijoles negros.", category: "mains", station: "grill", priceCents: 5600, spiceLevel: 0, tags: ["GLUTEN_FREE", "VEGAN"], modifiers: [large] },
  { name: "Camarones al chile", description: "Camarones con chile, limón y arroz.", category: "mains", station: "grill", priceCents: 8900, spiceLevel: 5, tags: ["SHELLFISH", "GLUTEN_FREE"], modifiers: [large] },
  { name: "Agua de jamaica", description: "Infusión fría de flor de jamaica.", category: "drinks", station: "drinks", priceCents: 1800, spiceLevel: 0, tags: ["GLUTEN_FREE", "VEGAN"], modifiers: [large] },
  { name: "Limonada con hierbabuena", description: "Limón fresco con hierbabuena y hielo.", category: "drinks", station: "drinks", priceCents: 2200, spiceLevel: 0, tags: ["GLUTEN_FREE", "VEGAN"], modifiers: [large] },
  { name: "Café con leche", description: "Café guatemalteco con leche.", category: "drinks", station: "drinks", priceCents: 2400, spiceLevel: 0, tags: ["DAIRY", "GLUTEN_FREE"], modifiers: [large] },
  { name: "Chocolate especiado", description: "Cacao con leche, canela y un toque de chile.", category: "drinks", station: "drinks", priceCents: 2700, spiceLevel: 1, tags: ["DAIRY", "GLUTEN_FREE"], modifiers: [large] },
];

const questions = [
  { prompt: "¿Cuál es la moneda oficial de Guatemala?", options: ["Peso", "Quetzal", "Colón"], correctIndex: 1 },
  { prompt: "¿De qué planta se obtiene el chocolate?", options: ["Cacao", "Café", "Vainilla"], correctIndex: 0 },
  { prompt: "¿En qué departamento está el lago de Atitlán?", options: ["Petén", "Izabal", "Sololá"], correctIndex: 2 },
  { prompt: "¿Cuál es la base del guacamole?", options: ["Pepino", "Aguacate", "Tomate"], correctIndex: 1 },
  { prompt: "¿Con qué grano se hacen tradicionalmente las tortillas guatemaltecas?", options: ["Maíz", "Avena", "Arroz"], correctIndex: 0 },
  { prompt: "¿Qué animal aparece en el escudo de Guatemala?", options: ["Jaguar", "Tucán", "Quetzal"], correctIndex: 2 },
  { prompt: "¿En qué departamento está Tikal?", options: ["Sacatepéquez", "Petén", "Escuintla"], correctIndex: 1 },
  { prompt: "¿Cuál de estos alimentos proviene de una flor?", options: ["Jamaica", "Canela", "Frijol"], correctIndex: 0 },
  { prompt: "¿Qué ingrediente le da su carácter cremoso al hummus tradicional?", options: ["Papa", "Arroz", "Garbanzo"], correctIndex: 2 },
  { prompt: "¿Qué sabor se asocia principalmente con el limón?", options: ["Dulce", "Ácido", "Umami"], correctIndex: 1 },
];

const street = process.argv.includes("--street");
const restaurantData = street
  ? { slug: "street-demo", name: "Patio Street", currency: "USD", timeZone: "America/El_Salvador", wifiSsid: "Patio-Invitados", wifiPassword: "patiodemo" }
  : { slug: "demo", name: "Mesa y Fogón", wifiSsid: "MesaYFogon-Invitados", wifiPassword: "fogondemo", taxBps: 1200 };
const categoryNames: Record<string, string> = street ? streetCategories : categories;
const catalog: Dish[] = street ? streetProducts.map((item) => ({
  ...item,
  modifiers: item.category === "combos" || item.category === "singles"
    ? [{ kind: "EXTRA", name: "Extra queso", priceDeltaCents: 100, tags: ["DAIRY"] }]
    : [],
})) : dishes;

async function seed() {
  return prisma.$transaction(async (tx) => {
    const restaurant = await tx.restaurant.upsert({
      where: { slug: restaurantData.slug },
      update: {},
      create: restaurantData,
    });
    const restaurantId = restaurant.id;

    const stationIds = new Map<string, string>();
    for (const name of Object.values(stations)) {
      const station = await tx.kitchenStation.upsert({
        where: { restaurantId_name: { restaurantId, name } },
        update: {},
        create: { restaurantId, name },
      });
      stationIds.set(name, station.id);
    }

    const categoryIds = new Map<string, string>();
    for (const [sortOrder, name] of Object.values(categoryNames).entries()) {
      const category = await tx.category.upsert({
        where: { restaurantId_name: { restaurantId, name } },
        update: {},
        create: { restaurantId, name, sortOrder },
      });
      categoryIds.set(name, category.id);
    }

    for (let number = 1; number <= 8; number += 1) {
      await tx.diningTable.upsert({
        where: { restaurantId_number: { restaurantId, number } },
        update: {},
        create: { restaurantId, number, tableCode: `m${number}-${randomBytes(8).toString("hex")}` },
      });
    }

    for (const { category, station, modifiers, ...dish } of catalog) {
      const categoryId = categoryIds.get(categoryNames[category]);
      const stationId = stationIds.get(stations[station]);
      if (!categoryId || !stationId) throw new Error(`Categoría o estación ausente para ${dish.name}`);

      const item = await tx.menuItem.upsert({
        where: { restaurantId_categoryId_name: { restaurantId, categoryId, name: dish.name } },
        update: {},
        create: { restaurantId, categoryId, stationId, ...dish },
      });

      for (const modifier of modifiers) {
        const { kind, name } = modifier;
        await tx.menuModifier.upsert({
          where: { restaurantId_menuItemId_kind_name: { restaurantId, menuItemId: item.id, kind, name } },
          update: {},
          create: { restaurantId, menuItemId: item.id, ...modifier },
        });
      }
    }

    for (const question of questions) {
      await tx.triviaQuestion.upsert({
        where: { restaurantId_prompt: { restaurantId, prompt: question.prompt } },
        update: {},
        create: { restaurantId, ...question },
      });
    }
    return tx.diningTable.findFirstOrThrow({
      where: { restaurantId, number: 1 }, select: { tableCode: true },
    });
  }, { timeout: 20_000 });
}

seed()
  .then(({ tableCode }) => console.log(`Restaurante demo preparado. /r/${restaurantData.slug}/mesa/${tableCode}`))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
