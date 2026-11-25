"use client";

import { BellRing, Check, Clipboard, Clock3, ListOrdered, LockKeyhole, Trophy, Trash2, Wifi } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { triviaAnswerSchema } from "@/lib/validators";

import { lineTotal, message, tableRequest, type Active, type Alert, type CartLine, type Trivia } from "./data";
import { Dialog, minutesSeconds, Stepper, useClock } from "./ui";
import styles from "./mesa.module.css";

export function AlertStatus({ alert }: { alert: Alert }) {
  const now = useClock(!alert.resolvedAt && !alert.cancelledAt);
  if (alert.cancelledAt) return null;
  if (alert.resolvedAt) return <p className={styles.alertStatus}><Check size={18} /> Atendido en {minutesSeconds(alert.responseTimeSeconds ?? 0)}</p>;
  const elapsed = now === null ? null : Math.max(0, Math.floor((now - Date.parse(alert.createdAt)) / 1000));
  return <p className={styles.alertStatus}><Clock3 size={18} /> Esperando al mesero <time>{elapsed === null ? "—:—" : minutesSeconds(elapsed)}</time></p>;
}

export function WifiDialog({ ssid, password, locked, close }: { ssid: string | null; password: string | null; locked: boolean; close: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  async function copy() {
    if (!password) return;
    try {
      if (!navigator.clipboard) throw new Error("clipboard");
      await navigator.clipboard.writeText(password);
      setStatus("Contraseña copiada.");
    } catch {
      field.current?.focus();
      field.current?.select();
      try {
        if (document.execCommand("copy")) {
          setStatus("Contraseña copiada.");
          return;
        }
      } catch {
        // The selected field remains available for the device's native copy action.
      }
      setStatus("Contraseña seleccionada. Usa la opción Copiar de tu teléfono.");
    }
  }
  return <Dialog title="Wi-Fi" close={close}>
    {ssid ? <div className={styles.form}>
      <div className={styles.summary}><span><Wifi size={18} /> Red</span><strong>{ssid}</strong></div>
      {locked ? <div className={styles.wifiLocked} role="status">
        <LockKeyhole size={19} aria-hidden="true" />
        <div><strong>Contraseña bloqueada</strong><p>Podrás verla cuando la mesa envíe su primer pedido a cocina.</p></div>
      </div> : password ? <div className={`${styles.form} ${styles.wifiReveal}`}>
        <label className={styles.field}>Contraseña<input readOnly ref={field} value={password} /></label>
        <button type="button" className={styles.primary} onClick={() => void copy()}><Clipboard size={17} /> Copiar contraseña</button>
        <p role="status" className={styles.muted}>{status}</p>
      </div> : <p className={styles.muted}>Esta red no tiene contraseña configurada.</p>}
    </div> : <p className={styles.muted}>El restaurante aún no ha publicado los datos de su Wi-Fi.</p>}
  </Dialog>;
}

const orderStatuses = { NEW: "Recibido", PREPARING: "En preparación", READY: "Listo", DELIVERED: "Entregado" };

export function OrdersDialog({ active, format, close }: {
  active: Active | null; format: (cents: number) => string; close: () => void;
}) {
  return <Dialog title="Pedidos de la mesa" close={close}>
    {active?.orders.length ? <div className={styles.form}>{active.orders.map((order, index) =>
      <section className={styles.orderCard} key={order.id}>
        <div className={styles.summary}><strong>Ronda {index + 1}</strong>
          {order.totalCents !== undefined && <span>{format(order.totalCents)}</span>}
        </div>
        {order.items.map((item) => <div key={item.id} className={styles.option}>
          <div><strong>{item.quantity} × {item.name}</strong>
            {item.modifiers && item.modifiers.length > 0 && <small>{item.modifiers.map(({ name }) => name).join(", ")}</small>}
            {item.notes && <small>{item.notes}</small>}
          </div>
          <span className={styles.orderStatus} data-status={item.status}>{orderStatuses[item.status]}</span>
        </div>)}
      </section>)}</div>
      : <div className={styles.empty}><ListOrdered size={22} /><p>Aún no se han enviado pedidos.</p></div>}
  </Dialog>;
}

export function CartDialog({ cart, format, busy, close, change, send, error, unavailable, menuReady, refresh }: {
  cart: CartLine[]; format: (cents: number) => string; busy: boolean; close: () => void;
  change: (id: string, quantity: number) => void; send: () => void; error: string;
  unavailable: { id: string; name: string }[]; menuReady: boolean; refresh: () => void;
}) {
  return <Dialog title="Tu carrito" close={() => { if (!busy) close(); }}>
    {cart.length || unavailable.length ? <div className={styles.form}>
      {!menuReady ? <div className={styles.notice}><p>Actualiza el menú para verificar los precios y las opciones.</p>
        <button type="button" className={styles.textButton} onClick={refresh}>Actualizar menú</button></div> : unavailable.map(({ id, name }) =>
        <div key={id} className={styles.unavailableLine}>
          <div><strong>{name}</strong><small>El producto o alguna opción ya no está disponible.</small></div>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => change(id, 0)}>Quitar</button>
        </div>)}
      {cart.map((line) => <div key={line.id} className={styles.cartLine}>
        <div><strong>{line.dish.name}</strong>
          {line.modifiers.length > 0 && <small>{line.modifiers.map(({ name }) => name).join(", ")}</small>}
          {line.notes && <small>{line.notes}</small>}
        </div>
        <strong>{format(lineTotal(line))}</strong>
        <div className={styles.quantityRow}>
          <Stepper label={`cantidad de ${line.dish.name}`} value={line.quantity} change={(quantity) => change(line.id, quantity)} disabled={busy} />
          <button type="button" className={styles.iconButton} disabled={busy} onClick={() => change(line.id, 0)} aria-label={`Quitar ${line.dish.name}`}><Trash2 size={18} /></button>
        </div>
      </div>)}
      <div className={styles.summary}><span>Subtotal estimado</span><strong>{format(cart.reduce((sum, line) => sum + lineTotal(line), 0))}</strong></div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <button type="button" className={styles.primary} disabled={busy || !menuReady || !!unavailable.length} onClick={send}>{busy ? "Enviando…" : "Enviar a cocina"}</button>
    </div> : <div className={styles.empty}><ListOrdered size={22} /><p>Agrega un platillo del menú para crear un pedido.</p></div>}
  </Dialog>;
}

export function TriviaDialog({ path, sessionId, tableNumber, refreshVersion, close }: {
  path: string; sessionId?: string; tableNumber: number; refreshVersion: number; close: () => void;
}) {
  const [data, setData] = useState<Trivia | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reads = useRef(0);
  const submitting = useRef(false);
  const round = data?.active;
  const now = useClock(!!round, offset);
  const left = now !== null && round ? Math.max(0, Math.ceil((Date.parse(round.endsAt) - now) / 1000)) : null;

  const refresh = useCallback(async () => {
    const version = ++reads.current;
    try {
      const next = await tableRequest<Trivia>(path);
      if (version !== reads.current) return;
      setOffset(Date.parse(next.serverTime) - Date.now());
      setData(next);
      setError("");
    } catch (failure) {
      if (version === reads.current) setError(message(failure));
    }
  }, [path]);

  useEffect(() => {
    void refresh();
    return () => { reads.current++; };
  }, [refresh, refreshVersion, sessionId]);

  useEffect(() => {
    if (left !== 0 || !round) return;
    void refresh();
  }, [left, round, refresh]);

  async function answer(optionIndex: number) {
    if (!round || !sessionId || submitting.current || round.selectedOptionIndex !== null || left === 0) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await tableRequest(path, { body: triviaAnswerSchema.parse({ sessionId, roundId: round.id, optionIndex }) });
      await refresh();
    } catch (failure) {
      setError(message(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <Dialog title="Trivia en vivo" close={close}>
    <div className={styles.form}>
      {!data && !error && <p role="status" className={styles.muted}>Cargando la trivia…</p>}
      {round && <section className={styles.triviaRound}>
        <div className={styles.summary}><span>Ronda activa</span><time>{left === null ? "—:—" : minutesSeconds(left)}</time></div>
        <h3>{round.question.prompt}</h3>
        {round.question.options.map((option, index) => <button key={index} type="button" className={styles.answer}
          aria-pressed={round.selectedOptionIndex === index}
          disabled={!sessionId || busy || left === 0 || round.selectedOptionIndex !== null}
          onClick={() => void answer(index)}>{round.selectedOptionIndex === index && <Check size={16} />}{option}</button>)}
        {!sessionId && <p className={styles.muted}>Abre la sesión de la mesa para responder.</p>}
        {round.selectedOptionIndex !== null && <p role="status" className={styles.muted}>Tu mesa ya respondió esta ronda.</p>}
      </section>}
      {data && !round && <p className={styles.muted}>No hay una ronda abierta en este momento.</p>}
      {data?.lastRound && <div className={styles.notice}>
        <Check size={18} /><div><strong>Última ronda</strong><p>{data.lastRound.question.prompt} · {data.lastRound.question.options[data.lastRound.question.correctIndex]}</p></div>
      </div>}
      {data && <section className={styles.leaderboard}>
        <h3><Trophy size={19} /> Posiciones</h3>
        {data.leaderboard.length ? <ol>{data.leaderboard.map(({ tableNumber: number, points }) =>
          <li key={number}><span>Mesa {number}{number === tableNumber && " · Tu mesa"}</span><strong>{points} pts</strong></li>)}</ol>
          : <p className={styles.muted}>Todavía no hay mesas participando.</p>}
      </section>}
      {error && <div role="alert" className={styles.error}>{error} <button type="button" className={styles.textButton} onClick={() => void refresh()}>Actualizar</button></div>}
    </div>
  </Dialog>;
}

export function WaiterButton({ alert, busy, call }: { alert: Alert | null; busy: boolean; call: () => void }) {
  const pending = alert && !alert.resolvedAt && !alert.cancelledAt;
  return <>
    <button type="button" className={styles.utility} onClick={call} disabled={busy || !!pending}>
      <span className={styles.utilityIcon}><BellRing size={19} /></span>
      <span>{pending ? "Mesero en camino" : busy ? "Enviando aviso…" : "Llamar al mesero"}</span>
    </button>
    {alert && <AlertStatus alert={alert} />}
  </>;
}
