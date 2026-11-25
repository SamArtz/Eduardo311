"use client";

import { ArrowRight, CheckCheck, ClipboardList, CookingPot, Utensils } from "lucide-react";
import { useState } from "react";

import { updateKitchenItemSchema } from "@/lib/validators";

import { BoardFeedback, BoardFrame, Filters, OrderTimer, useClock } from "./board-ui";
import { errorMessage, menuTags, type KitchenData, type KitchenStatus, type Ticket } from "./data";
import { useBoard } from "./use-board";
import styles from "./staff.module.css";

const columns = [
  { key: "NEW", title: "Nuevos", icon: ClipboardList, next: "PREPARING", action: "Empezar" },
  { key: "PREPARING", title: "En preparación", icon: CookingPot, next: "READY", action: "Marcar listo" },
  { key: "READY", title: "Listos", icon: CheckCheck, next: "DELIVERED", action: "Marcar entregado" },
] as const;

export function KitchenBoard() {
  const board = useBoard<KitchenData>();
  const [stationId, setStationId] = useState("");
  const [actionError, setActionError] = useState("");
  const now = useClock();
  const stationNames = new Map(board.data?.stations.map(({ id, name }) => [id, name]));
  const selected = stationNames.has(stationId) ? stationId : "";
  const visible = (status: KitchenStatus) => (board.data?.columns[status] ?? []).flatMap((ticket) => {
    const items = selected ? ticket.items.filter((item) => item.stationId === selected) : ticket.items;
    return items.length ? [{ ...ticket, items }] : [];
  });

  async function advance(id: string, status: "PREPARING" | "READY" | "DELIVERED") {
    setActionError("");
    try {
      await board.mutate(id, "kds", "PATCH", updateKitchenItemSchema.parse({ orderItemId: id, status }),
        status === "PREPARING" ? "Ítem en preparación." : status === "READY" ? "Ítem listo para recoger." : "Ítem entregado.");
    } catch (failure) {
      setActionError(errorMessage(failure));
    }
  }

  return <BoardFrame title="Cocina" restaurant={board.data?.restaurant} connection={board.connection} refresh={() => void board.refresh()}>
    <BoardFeedback error={board.error || actionError} message={board.message} clear={board.clearMessage} />
    {!board.data ? <div className={styles.empty}>{board.error ? "Actualiza el tablero o ingresa con una credencial de cocina." : "Cargando pedidos…"}</div> : <>
      <Filters label="Estaciones de cocina" options={[{ value: "", label: "Todas" }, ...board.data.stations.map(({ id, name }) => ({ value: id, label: name }))]} value={selected} select={setStationId} />
      <div className={styles.kanban}>
        {columns.map(({ key, title, icon: Icon, action, next }) => {
          const tickets = visible(key);
          return <section key={key} className={styles.column} data-column={key} aria-label={title}>
            <header><Icon size={20} /><h2>{title}</h2><span>{tickets.length}</span></header>
            <div className={styles.columnBody}>
              {tickets.length ? tickets.map((ticket) => <TicketCard key={ticket.orderId} ticket={ticket} now={now} stations={stationNames}
                action={action} pending={board.pending} advance={(id) => void advance(id, next)} />) :
                <div className={styles.empty}><Utensils size={18} /> Sin pedidos en esta columna.</div>}
            </div>
          </section>;
        })}
      </div>
    </>}
  </BoardFrame>;
}

function TicketCard({ ticket, now, stations, action, pending, advance }: {
  ticket: Ticket; now: number | undefined; stations: Map<string, string>;
  action: string; pending: string[]; advance: (id: string) => void;
}) {
  return <article className={styles.ticket}>
    <header className={styles.ticketHeading}><div><h3>Mesa {ticket.tableNumber}</h3><p>{ticket.guestCount} {ticket.guestCount === 1 ? "persona" : "personas"}</p></div>
      <OrderTimer now={now} date={ticket.createdAt} /></header>
    <ul className={styles.ticketItems}>
      {ticket.items.map((item) => {
        const tags = [...new Set([...item.tags, ...item.modifiers.flatMap(({ tags }) => tags.filter((tag) => tag !== "GLUTEN_FREE" && tag !== "VEGAN"))])];
        return <li key={item.id}>
          <div className={styles.itemTitle}><span className={styles.quantity}>{item.quantity}×</span><div><h4>{item.name}</h4>
            <small>{stations.get(item.stationId)}</small></div></div>
          {item.modifiers.length > 0 && <p className={styles.modifiers}>{item.modifiers.map(({ name, kind }) => `${kind === "EXTRA" ? "+" : ""}${name}`).join(" · ")}</p>}
          {item.notes && <p className={styles.notes}>Nota: {item.notes}</p>}
          {tags.length > 0 && <div className={styles.tagList}>{tags.map((tag) => <span key={tag} data-allergen={["DAIRY", "NUTS", "SHELLFISH"].includes(tag)}>{menuTags[tag]}</span>)}</div>}
          <button className={styles.action} type="button" disabled={pending.includes(item.id)}
            onClick={() => advance(item.id)}>{pending.includes(item.id) ? "Actualizando…" : action}<ArrowRight size={16} /></button>
        </li>;
      })}
    </ul>
  </article>;
}
