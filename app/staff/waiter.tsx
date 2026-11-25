"use client";

import { BellRing, Check, Clock3, CreditCard, DoorOpen, KeyRound, PackageCheck, UsersRound } from "lucide-react";
import { useRef, useState } from "react";
import type { z } from "zod";

import { closeTableSchema, paymentDecisionSchema, resolveAlertSchema, tableActionSchema, updateKitchenItemSchema, waiterQuerySchema } from "@/lib/validators";

import { BoardFeedback, BoardFrame, duration, elapsed, Filters, StaffDialog, useClock } from "./board-ui";
import { errorMessage, paymentNames, type PendingPayment, type WaiterData, type WaiterTable } from "./data";
import { useBoard } from "./use-board";
import styles from "./staff.module.css";

type Filter = z.infer<typeof waiterQuerySchema>["filter"];
type Confirmation =
  | { kind: "release" | "close"; tableId: string; sessionId: string; number: number }
  | { kind: "payment"; payment: PendingPayment; decision: "CONFIRM" | "CANCEL"; number: number };

const filters: { value: Filter; label: string }[] = [
  { value: "ALL", label: "Todas" },
  { value: "ALERT", label: "Con alerta" },
  { value: "READY", label: "Pedido listo" },
  { value: "ACTIVE", label: "Ocupadas" },
  { value: "FREE", label: "Libres" },
];

export function WaiterBoard() {
  const board = useBoard<WaiterData>();
  const now = useClock();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [actionError, setActionError] = useState("");
  const tables = board.data?.tables ?? [];
  const alerts = board.data?.priorityAlerts ?? [];
  const occupied = tables.filter(({ status }) => status === "ACTIVE").length;
  const ready = tables.filter(({ active }) => active?.orders.length).length;
  const visible = tables.filter(({ active, status }) =>
    filter === "ALL" || (filter === "ALERT" && !!active?.alerts.length) ||
    (filter === "READY" && !!active?.orders.length) || (filter === "ACTIVE" && status === "ACTIVE") ||
    (filter === "FREE" && status === "FREE"));
  const format = (cents: number) => new Intl.NumberFormat("es-GT", {
    style: "currency", currency: board.data?.restaurant.currency ?? "GTQ",
  }).format(cents / 100);

  async function resolve(alertId: string) {
    setActionError("");
    try {
      await board.mutate(alertId, "alerts", "PATCH", resolveAlertSchema.parse({ alertId }), "Alerta atendida.");
    } catch (failure) { setActionError(errorMessage(failure)); }
  }

  async function deliver(orderItemId: string) {
    setActionError("");
    try {
      await board.mutate(orderItemId, "kds", "PATCH", updateKitchenItemSchema.parse({ orderItemId, status: "DELIVERED" }), "Ítem entregado.");
    } catch (failure) { setActionError(errorMessage(failure)); }
  }

  function confirm(action: Confirmation, confirmUnpaid: boolean) {
    if (action.kind === "payment") {
      return board.mutate(action.payment.id, "payments", "PATCH",
        paymentDecisionSchema.parse({ paymentId: action.payment.id, decision: action.decision }),
        action.decision === "CONFIRM" ? "Pago confirmado." : "Pago cancelado.");
    }
    const input = { tableId: action.tableId, sessionId: action.sessionId };
    if (action.kind === "release") {
      return board.mutate(input.tableId, "tables/release", "POST", tableActionSchema.parse(input), "Control liberado.");
    }
    return board.mutate(input.tableId, "tables/close", "POST", closeTableSchema.parse({ ...input, confirmUnpaid }), "Mesa cerrada.");
  }

  return <BoardFrame title="Meseros" restaurant={board.data?.restaurant} connection={board.connection} refresh={() => void board.refresh()}>
    <BoardFeedback error={board.error || actionError} message={board.message} clear={board.clearMessage} />
    {!board.data ? <div className={styles.empty}>{board.error ? "Actualiza el tablero o ingresa con una credencial de meseros." : "Cargando mesas…"}</div> : <>
      <div className={styles.metrics}>
        <div><UsersRound size={20} /><span>Mesas ocupadas</span><strong>{occupied}<small> / {tables.length}</small></strong></div>
        <div><BellRing size={20} /><span>Alertas pendientes</span><strong>{alerts.length}</strong></div>
        <div><PackageCheck size={20} /><span>Mesas con pedido listo</span><strong>{ready}</strong></div>
      </div>
      <div className={styles.waiterLayout}>
        <aside className={styles.alerts} aria-label="Alertas prioritarias">
          <h2><BellRing size={20} /> Alertas prioritarias</h2>
          {alerts.length ? <ol>{alerts.map((alert) => <li key={alert.id}>
            <div className={styles.alertLine}><strong>Mesa {alert.session.table.number}</strong>
              <span><Clock3 size={15} /> <time>{duration(elapsed(now, alert.createdAt))}</time></span></div>
            <button className={styles.action} type="button" disabled={board.pending.includes(alert.id)} onClick={() => void resolve(alert.id)}>
              <Check size={16} /> Marcar atendido
            </button>
          </li>)}</ol> : <div className={styles.empty}>Sin alertas pendientes.</div>}
        </aside>
        <section className={styles.tables} aria-label="Mesas">
          <h2>Mesas</h2>
          <Filters label="Estado de las mesas" options={filters} value={filter} select={(value) => setFilter(waiterQuerySchema.parse({ filter: value }).filter)} />
          {visible.length ? <div className={styles.tableGrid}>{visible.map((table) => <TableCard key={table.id} table={table}
            format={format} pending={board.pending} delivery={(id) => void deliver(id)} confirmation={setConfirmation} />)}</div>
            : <div className={styles.empty}>No hay mesas con ese filtro.</div>}
        </section>
      </div>
      {confirmation && <ConfirmAction action={confirmation} format={format}
        close={() => setConfirmation(undefined)} execute={(unpaid) => confirm(confirmation, unpaid)} />}
    </>}
  </BoardFrame>;
}

function TableCard({ table, pending, format, delivery, confirmation }: {
  table: WaiterTable; pending: string[]; format: (cents: number) => string;
  delivery: (id: string) => void; confirmation: (action: Confirmation) => void;
}) {
  const { active, number } = table;
  const readyItems = active?.orders.flatMap(({ items }) => items) ?? [];
  const payment = active?.payments[0];

  function tableAction(kind: "close" | "release") {
    if (active) confirmation({ kind, tableId: table.id, sessionId: active.id, number });
  }

  return <article className={styles.tableCard} data-state={table.status}>
    <header className={styles.ticketHeading}><div><h3>Mesa {number}</h3>
      <p>{active ? `${active.guestCount} ${active.guestCount === 1 ? "persona" : "personas"}` : "Disponible para recibir comensales"}</p></div>
      <span className={styles.tableStatus}>{table.status === "ACTIVE" ? "Ocupada" : "Libre"}</span></header>
    {active && <div className={styles.tableContent}>
      <div className={styles.tableFlags}>
        <span><KeyRound size={14} /> {active.hasHost ? "Con anfitrión" : "Control disponible"}</span>
        {active.alerts.length > 0 && <span data-alert><BellRing size={14} /> Con alerta</span>}
      </div>
      {readyItems.length > 0 && <section className={styles.readyItems}><h4>Listos para recoger</h4>
        <ul>{readyItems.map((item) => <li key={item.id}><div><strong>{item.quantity}× {item.name}</strong><small>{item.station.name}</small></div>
          <button type="button" className={styles.secondary} disabled={pending.includes(item.id)}
            onClick={() => delivery(item.id)} aria-label={`Entregar ${item.name} de mesa ${number}`}>Entregar</button></li>)}</ul>
      </section>}
      {payment && <section className={styles.payment}>
        <div><CreditCard size={17} /><div><h4>Pago por confirmar</h4><p>{paymentNames[payment.method]} · {format(payment.totalCents)}</p></div></div>
        <div className={styles.buttons}>
          <button type="button" className={styles.action} onClick={() => confirmation({ kind: "payment", payment, decision: "CONFIRM", number })}>Confirmar pago</button>
          <button type="button" className={styles.secondary} onClick={() => confirmation({ kind: "payment", payment, decision: "CANCEL", number })}>Cancelar pago</button>
        </div>
      </section>}
      <div className={styles.buttons}>
        <button type="button" className={styles.secondary} disabled={!active.hasHost || pending.includes(table.id)} onClick={() => tableAction("release")}>
          <KeyRound size={16} /> Liberar control
        </button>
        <button type="button" className={styles.danger} disabled={!!payment || pending.includes(table.id)} onClick={() => tableAction("close")}>
          <DoorOpen size={16} /> Cerrar mesa
        </button>
      </div>
    </div>}
  </article>;
}

function ConfirmAction({ action, format, close, execute }: {
  action: Confirmation; format: (cents: number) => string;
  close: () => void; execute: (confirmUnpaid: boolean) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [unpaid, setUnpaid] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const title = action.kind === "payment"
    ? (action.decision === "CONFIRM" ? "Confirmar pago" : "Cancelar pago")
    : action.kind === "release" ? "Liberar control" : "Cerrar mesa";
  const detail = action.kind === "release" ? "La siguiente persona que acerque su teléfono a la placa NFC podrá tomar el control." :
    action.kind === "close" ? "La sesión terminará y se cancelarán las alertas pendientes." :
    action.kind === "payment" && action.decision === "CONFIRM" ? `Confirma que ya cobraste ${format(action.payment.totalCents)}. Si se cubre la cuenta, la mesa se cerrará.` :
    "Se cancelará la solicitud y el importe volverá a quedar pendiente en la cuenta.";

  async function submit() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try { if (await execute(unpaid)) close(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { running.current = false; setBusy(false); }
  }

  return <StaffDialog title={title} close={() => { if (!busy) close(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <p><strong>Mesa {action.number}</strong></p><p>{detail}</p>
      {action.kind === "close" && <label className={styles.checkbox}><input type="checkbox" disabled={busy} checked={unpaid}
        onChange={(event) => setUnpaid(event.target.checked)} /> Cerrar aunque quede saldo pendiente.</label>}
      {error && <p className={styles.inlineError} role="alert">{error}</p>}
      <button className={action.kind === "close" ? styles.danger : styles.primary} type="submit" disabled={busy}>{busy ? "Procesando…" : title}</button>
    </form>
  </StaffDialog>;
}
