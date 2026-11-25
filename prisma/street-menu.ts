import type { MenuTag } from "@prisma/client";

export const streetCategories = {
  combos: "Combos",
  singles: "Individuales",
  sides: "Papas y acompañamientos",
  extras: "Extras",
  drinks: "Bebidas",
};

export type StreetCategory = keyof typeof streetCategories;
export type StreetStation = "grill" | "cold" | "drinks";
type Photo = "burger" | "hot-dog" | "combo" | "papas" | "queso" | "bebidas";

type StreetProduct = {
  name: string;
  description: string;
  category: StreetCategory;
  station: StreetStation;
  priceCents: number;
  spiceLevel: number;
  tags: MenuTag[];
  imageUrl: string | null;
};

function product(
  category: StreetCategory, name: string, priceCents: number, description: string,
  photo?: Photo, tags: MenuTag[] = [], spiceLevel = 0,
): StreetProduct {
  return {
    name, description, category, priceCents, tags, spiceLevel,
    station: category === "drinks" ? "drinks" : "grill",
    imageUrl: photo ? `/menu-demo/${photo}.webp` : null,
  };
}

export const streetProducts = [
  product("combos", "Dúo Picossini", 1799, "Dos burgers, dos porciones de papas, queso frito y dos sodas.", "combo", ["DAIRY"]),
  product("combos", "Combo Freakie Dog Monster", 399, "Hot dog Monster con papas y bebida.", "hot-dog"),
  product("combos", "Burger Duo", 1499, "Dos burgers con papas y bebidas.", "burger", ["DAIRY"]),
  product("combos", "Burger Box", 1999, "Burgers, hot dogs, papas, sodas y trocitos de jalapeño.", "combo", ["DAIRY"], 2),
  product("combos", "Combo Freakie Burger Monster", 799, "Burger Monster con papas y bebida.", "burger", ["DAIRY"]),
  product("combos", "Combo Chili Dog", 599, "Chili dog con papas y bebida.", "hot-dog", [], 1),
  product("combos", "Sweet Burger Duo", 1799, "Dos Sweet Burgers, dos porciones de papas y dos bebidas.", "burger", ["DAIRY"]),
  product("combos", "Freakie Family", 1599, "Hot dogs, papas y sodas para compartir.", "combo"),
  product("singles", "Freakie Dog", 199, "Hot dog con salsa y toppings de la casa.", "hot-dog"),
  product("singles", "Chili Dog", 299, "Hot dog cargado con chili de la casa.", "hot-dog", [], 1),
  product("singles", "Freakie Burger", 799, "Burger con queso fundido y salsa de la casa.", "burger", ["DAIRY"]),
  product("singles", "Queso Frito", 299, "Bocados de queso empanizados y dorados.", "queso", ["DAIRY"]),
  product("sides", "Freakie Fries", 199, "Papas fritas con el toque de la casa.", "papas"),
  product("sides", "Mini Fancy", 499, "Papas cargadas en porción individual.", "papas", ["DAIRY"]),
  product("sides", "Mini Mala Fancy", 499, "Papas cargadas con un toque picante.", "papas", ["DAIRY"], 2),
  product("sides", "Fancy XL", 699, "Papas cargadas grandes para compartir.", "papas", ["DAIRY"]),
  product("extras", "Costra de Queso Hot Dog", 100, "Una costra crujiente de queso para acompañar.", undefined, ["DAIRY"]),
  product("extras", "Chile Bombazo", 400, "Salsa de chile para acompañar.", undefined, [], 4),
  product("drinks", "Coca-Cola", 175, "Bebida de cola.", "bebidas"),
  product("drinks", "Coca-Cola Zero", 175, "Bebida de cola sin azúcar.", "bebidas"),
  product("drinks", "Té de frambuesa", 175, "Té frío de frambuesa.", "bebidas"),
  product("drinks", "Té limón", 175, "Té frío de limón.", "bebidas"),
  product("drinks", "Agua", 140, "Botella de agua."),
];
