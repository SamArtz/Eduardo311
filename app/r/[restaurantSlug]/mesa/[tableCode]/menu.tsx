"use client";

import { ChevronRight, Flame, Plus, Search, Utensils, X } from "lucide-react";
import { useRef, useState } from "react";
import { orderLineSchema } from "@/lib/validators";

import { lineTotal, message, requestId, tagLabels, type CartLine, type Category, type Dish } from "./data";
import { Dialog, Stepper } from "./ui";
import styles from "./mesa.module.css";

type Format = (cents: number) => string;

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function DishCard({ dish, canOrder, format, open, featured = false }: {
  dish: Dish; canOrder: boolean; format: Format; open: (dish: Dish) => void; featured?: boolean;
}) {
  return <article className={featured ? `${styles.dish} ${styles.featuredDish}` : styles.dish}>
    {dish.imageUrl && <div className={styles.dishMedia}><img className={styles.dishPhoto} src={dish.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /></div>}
    <div className={styles.dishBody}>
      <h4>{dish.name}</h4>
      {dish.description && <p>{dish.description}</p>}
      <DishTags dish={dish} />
      <div className={styles.dishFoot}>
        <strong>{format(dish.priceCents)}</strong>
        <button className={styles.dishAction} data-order={canOrder} type="button" onClick={() => open(dish)} aria-label={`${canOrder ? "Agregar" : "Ver"} ${dish.name}`}>
          {canOrder ? <Plus size={21} aria-hidden="true" /> : <ChevronRight size={20} aria-hidden="true" />}
        </button>
      </div>
    </div>
  </article>;
}

export function Menu({ categories, canOrder, format, open }: {
  categories: Category[]; canOrder: boolean; format: Format; open: (dish: Dish) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const menu = useRef<HTMLElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const availableCategories = categories.filter(({ items }) => items.length);
  const selected = availableCategories.some(({ id }) => id === category) ? category : "";

  function chooseCategory(id: string, button: HTMLButtonElement) {
    setCategory(id);
    const bounds = navigation.current?.getBoundingClientRect();
    if (bounds) navigation.current?.scrollBy({ left: button.getBoundingClientRect().left - bounds.left - 6 });
    if (menu.current && menu.current.getBoundingClientRect().top < 0) menu.current.scrollIntoView({ block: "start" });
  }
  const term = normalize(search.trim());
  const matches = categories.filter(({ id }) => !selected || id === selected)
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => !term || normalize(
        [category.name, item.name, item.description ?? "", ...item.tags.map((tag) => tagLabels[tag])].join(" "),
      ).includes(term)),
    })).filter(({ items }) => items.length);

  const firstCategory = categories.find(({ items }) => items.length);
  const images = new Set<string>();
  const featured = !selected && !term ? (firstCategory?.items.filter(({ imageUrl }) => {
    if (!imageUrl || images.has(imageUrl)) return false;
    images.add(imageUrl);
    return true;
  }).slice(0, 3) ?? []) : [];
  const featuredIds = new Set(featured.length === 3 ? featured.map(({ id }) => id) : []);

  return <section id="menu" ref={menu} className={styles.menu}>
    <div className={styles.menuHeading}>
      <h2>Menú</h2>
      <div className={styles.search}>
        <Search size={18} aria-hidden="true" />
        <input type="search" placeholder="Buscar en el menú" aria-label="Buscar en el menú" value={search} onChange={(event) => setSearch(event.target.value)} />
        {search && <button className={styles.iconButton} type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch("")}><X size={16} /></button>}
      </div>
    </div>
    <div className={styles.categoryBar}>
      <nav className={styles.filters} ref={navigation} aria-label="Categorías del menú">
        {[{ id: "", name: "Todo" }, ...availableCategories].map(({ id, name }) =>
          <button key={id} type="button" aria-pressed={selected === id} onClick={(event) => chooseCategory(id, event.currentTarget)}>{name}</button>)}
      </nav>
    </div>
    {featuredIds.size > 0 && <section className={styles.featured}>
      <h3>Destacados</h3>
      <div>{featured.map((dish) => <DishCard key={dish.id} dish={dish} canOrder={canOrder} format={format} open={open} featured />)}</div>
    </section>}
    {matches.length ? matches.map(({ id, name, items }) => {
      const remaining = items.filter((dish) => !featuredIds.has(dish.id));
      return remaining.length > 0 && <section key={id} className={styles.category}>
        <h3>{name}</h3>
        <div className={styles.dishGrid}>
          {remaining.map((dish) => <DishCard key={dish.id} dish={dish} canOrder={canOrder} format={format} open={open} />)}
        </div>
      </section>;
    }) : <div className={styles.empty}><Utensils size={22} /><p>{search ? "No encontramos platillos para esa búsqueda." : "No hay platillos disponibles en esta categoría."}</p></div>}
  </section>;
}

function DishTags({ dish }: { dish: Dish }) {
  return <div className={styles.tags}>
    <span className={dish.spiceLevel ? styles.spice : undefined}><Flame size={14} aria-hidden="true" /> {dish.spiceLevel ? `Picante ${dish.spiceLevel}/5` : "Sin picante"}</span>
    {dish.tags.map((tag) => <span key={tag}>{tagLabels[tag]}</span>)}
  </div>;
}

export function DishDialog({ dish, canOrder, format, close, add }: {
  dish: Dish; canOrder: boolean; format: Format; close: () => void; add: (line: CartLine) => void;
}) {
  const [size, setSize] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const modifiers = dish.modifiers.filter(({ id }) => id === size || extras.includes(id));
  const sizes = dish.modifiers.filter(({ kind }) => kind === "SIZE");
  const extraOptions = dish.modifiers.filter(({ kind }) => kind === "EXTRA");
  const price = (delta: number) => delta < 0 ? format(delta) : `+${format(delta)}`;

  return <Dialog title={dish.name} close={close}>
    {dish.imageUrl && <img className={styles.detailPhoto} src={dish.imageUrl} alt="" referrerPolicy="no-referrer" />}
    {dish.description && <p className={styles.muted}>{dish.description}</p>}
    <div className={styles.detailMeta}><DishTags dish={dish} /><strong>{format(dish.priceCents)}</strong></div>
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      if (!canOrder) return;
      try {
        orderLineSchema.parse({ menuItemId: dish.id, quantity, modifierIds: modifiers.map(({ id }) => id), notes });
        add({ id: requestId(), dish, modifiers, quantity, notes: notes.trim() });
      } catch (failure) {
        setError(message(failure));
      }
    }}>
      {!!sizes.length && <fieldset>
        <legend>Tamaño</legend>
        {canOrder && <label className={styles.option}><span><input type="radio" name="size" value="" checked={!size} onChange={() => setSize("")} /> Estándar</span><span>{format(dish.priceCents)}</span></label>}
        {sizes.map((option) => <label key={option.id} className={styles.option}><span>
          {canOrder && <input type="radio" name="size" value={option.id} checked={size === option.id} onChange={() => setSize(option.id)} />}
          <span>{option.name}{option.tags.length > 0 && <small>{option.tags.map((tag) => tagLabels[tag]).join(" · ")}</small>}</span>
        </span><span>{price(option.priceDeltaCents)}</span></label>)}
      </fieldset>}
      {!!extraOptions.length && <fieldset>
        <legend>Extras</legend>
        {extraOptions.map((option) => <label key={option.id} className={styles.option}><span>
          {canOrder && <input type="checkbox" checked={extras.includes(option.id)} onChange={(event) =>
            setExtras(event.target.checked ? [...extras, option.id] : extras.filter((id) => id !== option.id))} />}
          <span>{option.name}{option.tags.length > 0 && <small>{option.tags.map((tag) => tagLabels[tag]).join(" · ")}</small>}</span>
        </span><span>{price(option.priceDeltaCents)}</span></label>)}
      </fieldset>}
      {canOrder && <>
        <label className={styles.field}>Notas <span>Opcional</span><textarea maxLength={300} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. sin cebolla" /></label>
        <div className={styles.quantityRow}><span>Cantidad</span><Stepper label="cantidad" value={quantity} change={setQuantity} /></div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button type="submit" className={styles.primary}><Plus size={18} /> Agregar · {format(lineTotal({ id: "", dish, modifiers, quantity, notes }))}</button>
      </>}
    </form>
  </Dialog>;
}
