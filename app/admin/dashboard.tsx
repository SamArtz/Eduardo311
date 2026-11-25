"use client";

import {
  Armchair, BarChart3, CookingPot, Gamepad2, LayoutGrid, Pencil, Play,
  Plus, Search, Settings2, Tags, Trash2, Utensils,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { createAdminSchema, deleteAdminSchema, updateAdminSchema } from "@/lib/admin-validation";
import { startTriviaRoundSchema } from "@/lib/validators";

import { BoardFeedback, BoardFrame, duration, StaffDialog, useClock } from "../staff/board-ui";
import { menuTags } from "../staff/data";
import { useBoard } from "../staff/use-board";
import { Editor, FormAction, SettingsForm } from "./forms";
import { Overview } from "./overview";
import { resourceLabels, type AdminData, type CreateInput, type EditorTarget, type Resource } from "./types";
import styles from "./admin.module.css";

const tabs = [
  { id: "overview", label: "Resumen", icon: BarChart3 },
  { id: "product", label: "Productos", heading: "Productos", icon: Utensils },
  { id: "category", label: "Categorías", heading: "Categorías", icon: Tags },
  { id: "station", label: "Estaciones", heading: "Estaciones de cocina", icon: CookingPot },
  { id: "question", label: "Trivia", heading: "Preguntas de trivia", icon: Gamepad2 },
  { id: "table", label: "Mesas", heading: "Mesas", icon: Armchair },
  { id: "settings", label: "Configuración", icon: Settings2 },
] as const;

type Tab = (typeof tabs)[number]["id"];
type Removal = { kind: Resource; id: string; label: string; archive: boolean };
type RoundTarget = { id: string; prompt: string };

export function AdminDashboard() {
  const board = useBoard<AdminData>();
  const [tab, setTab] = useState<Tab>("overview");
  const [editor, setEditor] = useState<EditorTarget>();
  const [removal, setRemoval] = useState<Removal>();
  const [round, setRound] = useState<RoundTarget>();
  const data = board.data;

  const format = (cents: number) => new Intl.NumberFormat("es-GT", {
    style: "currency", currency: data?.restaurant.currency ?? "GTQ",
  }).format(cents / 100);

  function save(input: CreateInput, id?: string) {
    return id ? board.mutate(id, "admin", "PATCH", updateAdminSchema.parse({ ...input, id }), "Cambios guardados.")
      : board.mutate(input.kind, "admin", "POST", createAdminSchema.parse(input), "Registro creado.");
  }

  function selectTab(next: Tab) {
    setTab(next);
    board.clearMessage();
  }

  return <BoardFrame title="Administración" restaurant={data?.restaurant} connection={board.connection} refresh={() => void board.refresh()}>
    <BoardFeedback error={board.error} message={board.message} clear={board.clearMessage} />
    {!data ? <div className={styles.empty}>{board.error ? "Ingresa con una credencial de administración de este restaurante." : "Cargando administración…"}</div> :
      <div className={styles.layout}>
        <nav className={styles.navigation} aria-label="Secciones administrativas">
          {tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={tab === id ? "page" : undefined}
            onClick={() => selectTab(id)}><Icon size={18} aria-hidden="true" />{label}</button>)}
        </nav>
        <div className={styles.content}>
          {tab === "overview" ? <Overview data={data} format={format} /> :
            tab === "settings" ? <SettingsForm initial={data.restaurant} save={(values) =>
              board.mutate("settings", "admin", "PATCH", updateAdminSchema.parse({ kind: "settings", values }), "Configuración guardada.")} /> :
              <Catalog key={tab} kind={tab} data={data} format={format} edit={setEditor} remove={setRemoval}
                start={setRound} />}
        </div>
      </div>}
    {data && editor && <Editor target={editor} data={data} close={() => setEditor((current) => current === editor ? undefined : current)} save={save} />}
    {removal && <StaffDialog title={removal.archive ? "Desactivar registro" : "Eliminar registro"} close={() => setRemoval(undefined)}>
      <FormAction label={removal.archive ? "Desactivar" : "Eliminar"} onSave={async () => {
        const body = deleteAdminSchema.parse({ kind: removal.kind, id: removal.id });
        if (await board.mutate(removal.id, "admin", "DELETE", body, "Registro eliminado.", "Registro desactivado. Se conservó su historial.")) {
          setRemoval((current) => current === removal ? undefined : current);
        }
      }}>
        <p><strong>{removal.label}</strong></p>
        <p className={styles.muted}>{removal.archive ? "Dejará de estar disponible. El historial se conserva." : "Confirma que quieres eliminar este registro."}</p>
      </FormAction>
    </StaffDialog>}
    {round && <StaffDialog title="Iniciar ronda" close={() => setRound(undefined)}>
      <FormAction label="Iniciar ronda" onSave={async (form) => {
        const durationSeconds = Number(form.get("seconds"));
        if (await board.mutate(round.id, "trivia", "POST", startTriviaRoundSchema.parse({ questionId: round.id, durationSeconds }), "Ronda iniciada.")) {
          setRound((current) => current === round ? undefined : current);
        }
      }}>
        <p><strong>{round.prompt}</strong></p>
        <label>Duración en segundos<input name="seconds" type="number" min={5} max={300} defaultValue={30} required /></label>
      </FormAction>
    </StaffDialog>}
  </BoardFrame>;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function Catalog({ kind, data, format, edit, remove, start }: {
  kind: Resource; data: AdminData; format: (cents: number) => string;
  edit: (target: EditorTarget) => void; remove: (target: Removal) => void; start: (target: RoundTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState("all");
  const now = useClock();
  const roundEnd = data.activeRound ? Date.parse(data.activeRound.endsAt) : null;
  const seconds = roundEnd === null || now === undefined ? undefined : Math.max(0, Math.ceil((roundEnd - now) / 1000));
  const roundActive = roundEnd !== null && seconds !== 0;
  const term = normalize(query.trim());
  const matches = (value: string) => !term || normalize(value).includes(term);
  const categoryNames = new Map(data.categories.map(({ id, name }) => [id, name]));
  const stationNames = new Map(data.stations.map(({ id, name }) => [id, name]));
  const noProductSetup = kind === "product" && (!data.categories.length || !data.stations.length);

  function actions(target: EditorTarget & { record: { id: string } }, label: string, options?: { editLocked?: boolean; deleteLocked?: boolean; archive?: boolean; deleteNote?: string }) {
    return <div className={styles.rowActions}>
      <button type="button" className={styles.secondary} onClick={() => edit(target)} disabled={options?.editLocked}
        aria-label={`Editar ${label}`}><Pencil size={15} /> Editar</button>
      <button type="button" className={styles.remove} disabled={options?.deleteLocked} title={options?.deleteNote}
        onClick={() => remove({ kind, id: target.record.id, label, archive: !!options?.archive })}
        aria-label={`${options?.archive ? "Desactivar" : "Eliminar"} ${label}`}><Trash2 size={15} />{options?.archive ? "Desactivar" : "Eliminar"}</button>
    </div>;
  }

  let rows: ReactNode[] = [];
  if (kind === "product") rows = data.products.filter((product) => matches(`${product.name} ${categoryNames.get(product.categoryId) ?? ""}`)
    && (availability === "all" || (availability === "visible") === product.available)).map((product) =>
    <li key={product.id} className={styles.row}>
      {product.imageUrl && <img className={styles.thumbnail} src={product.imageUrl} loading="lazy" alt="" referrerPolicy="no-referrer" />}
      <div className={styles.rowInfo}><div className={styles.rowTitle}><h3>{product.name}</h3><span className={styles.badge} data-active={product.available}>{product.available ? "Visible" : "Oculto"}</span></div>
        <p>{format(product.priceCents)} · {categoryNames.get(product.categoryId)} · {stationNames.get(product.stationId)} · Picante {product.spiceLevel}/5</p>
        {(product.tags.length > 0 || product.modifiers.length > 0) && <p>{[
          ...product.tags.map((tag) => menuTags[tag]),
          ...(product.modifiers.length ? [`${product.modifiers.length} opciones`] : []),
        ].join(" · ")}</p>}
      </div>
      {actions({ kind, record: product }, product.name, { archive: product._count.orderItems > 0, deleteLocked: product._count.orderItems > 0 && !product.available })}
    </li>);
  if (kind === "category") rows = data.categories.filter(({ name }) => matches(name)).map((category) =>
    <li key={category.id} className={styles.row}>
      <div className={styles.rowInfo}><h3>{category.name}</h3><p>Orden {category.sortOrder} · {category._count.items} productos</p></div>
      {actions({ kind, record: category }, category.name, { deleteLocked: category._count.items > 0, deleteNote: "Reasigna los productos de esta categoría." })}
    </li>);
  if (kind === "station") rows = data.stations.filter(({ name }) => matches(name)).map((station) =>
    <li key={station.id} className={styles.row}>
      <div className={styles.rowInfo}><h3>{station.name}</h3><p>{station._count.items} productos{station._count.orderItems > 0 ? " · Con historial de pedidos" : ""}</p></div>
      {actions({ kind, record: station }, station.name, { deleteLocked: station._count.items > 0 || station._count.orderItems > 0, deleteNote: "La estación está vinculada a productos o pedidos." })}
    </li>);
  if (kind === "table") rows = data.tables.filter(({ number }) => matches(`Mesa ${number}`)).map((table) =>
    <li key={table.id} className={styles.row}>
      <div className={styles.rowInfo}><div className={styles.rowTitle}><h3>Mesa {table.number}</h3>
        <span className={styles.badge} data-active={table.status === "FREE"}>{table.status === "ACTIVE" ? "Ocupada" : "Libre"}</span></div>
        {table._count.sessions > 0 && <p>Con historial de sesiones</p>}</div>
      {actions({ kind, record: table }, `mesa ${table.number}`, { editLocked: table.status === "ACTIVE",
        deleteLocked: table.status === "ACTIVE" || table._count.sessions > 0, deleteNote: "Las mesas ocupadas o con historial se conservan." })}
    </li>);
  if (kind === "question") rows = data.questions.filter(({ prompt }) => matches(prompt)).map((question) =>
    <li key={question.id} className={styles.row}>
      <div className={styles.rowInfo}><div className={styles.rowTitle}><h3>{question.prompt}</h3>
        <span className={styles.badge} data-active={question.available}>{question.available ? "Disponible" : "Desactivada"}</span></div>
        <p>{question.options.length} opciones · Respuesta correcta: {question.options[question.correctIndex]}</p>
      </div>
      {actions({ kind, record: question }, question.prompt, { archive: question._count.rounds > 0, deleteLocked: question._count.rounds > 0 && !question.available })}
      {question.available && <button type="button" className={styles.secondary} disabled={roundActive}
        onClick={() => start({ id: question.id, prompt: question.prompt })}><Play size={15} /> Iniciar ronda</button>}
    </li>);

  const title = tabs.find((item) => item.id === kind && "heading" in item);
  return <section className={styles.catalog}>
    <div className={styles.catalogHeading}><div><h2>{title && "heading" in title ? title.heading : "Catálogo"}</h2>
      {noProductSetup && <p className={styles.muted}>Crea una categoría y una estación para agregar productos.</p>}</div>
      <button type="button" className={styles.primary} disabled={noProductSetup} onClick={() => edit({ kind })}><Plus size={17} /> {resourceLabels[kind].create}</button>
    </div>
    {kind === "question" && roundActive && <p className={styles.round} role="status">Ronda en curso · {duration(seconds)}</p>}
    <div className={styles.controls}><label><Search size={17} aria-hidden="true" /><input aria-label="Buscar registros" type="search"
      value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar…" /></label>
      {kind === "product" && <select aria-label="Visibilidad" value={availability} onChange={(event) => setAvailability(event.target.value)}>
        <option value="all">Todos</option><option value="visible">Visibles</option><option value="hidden">Ocultos</option>
      </select>}
    </div>
    {rows.length ? <ul className={styles.rows}>{rows}</ul> : <div className={styles.empty}><LayoutGrid size={21} />No hay registros para mostrar.</div>}
  </section>;
}
