"use client";

import { CreditCard, ReceiptText, Star } from "lucide-react";
import { useRef, useState } from "react";

import { checkoutQuoteSchema } from "@/lib/validators";

import { message, paymentLabels, type Active, type PayInput, type Payment, type Quote, type QuoteInput } from "./data";
import { Dialog, Stepper } from "./ui";
import styles from "./mesa.module.css";

type Format = (cents: number) => string;
type Result = { payment: Payment; closed: boolean };

export function Checkout({ active, format, close, quote, pay, completed }: {
  active: Active; format: Format; close: () => void;
  quote: (input: QuoteInput) => Promise<Quote>;
  pay: (input: Omit<PayInput, "requestId">) => Promise<Result>;
  completed: (result: Result) => void;
}) {
  const paid = (active.payments ?? []).filter(({ status }) => status === "PAID");
  const pending = active.payments?.find(({ status }) => status === "PENDING");
  const equalPlan = paid.find(({ equalPartySize }) => equalPartySize !== null);
  const paidShares = new Set(paid.map(({ equalShareIndex }) => equalShareIndex));
  const [mode, setMode] = useState<QuoteInput["split"]["kind"]>("FULL");
  const [partySize, setPartySize] = useState(equalPlan?.equalPartySize ?? active.session.guestCount);
  const [shareIndex, setShareIndex] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [tip, setTip] = useState<0 | 10 | 15 | "CUSTOM">(0);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<PayInput["method"]>("CARD_ONLINE");
  const [email, setEmail] = useState("");
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [calculated, setCalculated] = useState<{ signature: string; quote: Quote } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  const paidByItem = new Map<string, number>();
  for (const payment of paid) {
    for (const { orderItemId, quantity } of payment.allocations ?? []) {
      paidByItem.set(orderItemId, (paidByItem.get(orderItemId) ?? 0) + quantity);
    }
  }
  const items = active.orders.flatMap(({ items }) => items.map((item) => ({
    ...item, remaining: item.quantity - (paidByItem.get(item.id) ?? 0),
  }))).filter(({ remaining }) => remaining > 0);
  const original = active.orders.reduce((sum, order) => sum + (order.totalCents ?? 0), 0);
  const balance = original - paid.reduce((sum, p) => sum + p.subtotalCents + p.taxCents, 0);
  const selectedItems = items.filter(({ id }) => quantities[id] > 0).map(({ id, remaining }) => ({
    orderItemId: id, quantity: Math.min(quantities[id], remaining),
  }));
  const shares = Array.from({ length: partySize }, (_, index) => index).filter((index) => !paidShares.has(index));
  const selectedShare = shares.includes(shareIndex) ? shareIndex : shares[0];
  const customValue = custom.trim().replace(",", ".");
  const [whole, fraction = ""] = customValue.split(".");
  const tipCents = /^\d{1,5}(\.\d{1,2})?$/.test(customValue)
    ? Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
    : NaN;
  const input: QuoteInput = {
    sessionId: active.session.id,
    split: mode === "EQUAL" ? { kind: "EQUAL", partySize, shareIndex: selectedShare }
      : mode === "ITEMS" ? { kind: "ITEMS", items: selectedItems } : { kind: "FULL" },
    tip: tip === "CUSTOM" ? { kind: "CUSTOM", tipCents } : { kind: "PERCENT", percent: tip },
  };
  const signature = JSON.stringify({ input, orders: active.orders.map(({ id }) => id), paid: paid.map(({ id }) => id) });
  const shown = calculated?.signature === signature ? calculated.quote : null;

  async function submit() {
    if (submitting.current || pending) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (!shown) {
        const result = await quote(checkoutQuoteSchema.parse(input));
        setCalculated({ signature, quote: result });
        return;
      }
      const details = { ...input, method, receiptEmail: email.trim() || undefined,
        review: stars ? { stars, comment: comment.trim() || undefined } : undefined };
      const result = await pay(details);
      completed(result);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

  return <Dialog title="Tu cuenta" close={() => { if (!busy) close(); }}>
    <div className={styles.summary}><span>Saldo de la mesa</span><strong>{format(balance)}</strong></div>
    {pending ? <div className={styles.notice}><ReceiptText size={19} /><div><strong>Pago pendiente · {format(pending.totalCents)}</strong><p>El mesero debe confirmar el pago en mesa.</p></div></div> :
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={busy}><legend>Dividir la cuenta</legend>
          <div className={styles.segmented}>
            {([["FULL", "Completa"], ["EQUAL", "Partes iguales"], ["ITEMS", "Por platillos"]] as const).map(([value, label]) =>
              <button type="button" key={value} aria-pressed={mode === value}
                disabled={(value === "ITEMS" && !!equalPlan) || (value === "EQUAL" && paid.length > 0 && !equalPlan)}
                onClick={() => setMode(value)}>{label}</button>)}
          </div>
        </fieldset>
        {mode === "EQUAL" && <fieldset disabled={busy}>
          <div className={styles.quantityRow}><span>Número de partes</span><Stepper label="partes" value={partySize} change={setPartySize} disabled={!!equalPlan} /></div>
          <label className={styles.field}>Parte que vas a pagar
            <select value={selectedShare ?? ""} onChange={(event) => setShareIndex(Number(event.target.value))}>
              {shares.map((index) => <option key={index} value={index}>Parte {index + 1} de {partySize} · {format(Math.floor(original / partySize) + Number(index < original % partySize))}</option>)}
            </select>
          </label>
        </fieldset>}
        {mode === "ITEMS" && <fieldset disabled={busy}><legend>Selecciona los platillos</legend>
          {items.map(({ id, name, unitPriceCents, remaining }) =>
            <div className={styles.quantityRow} key={id}>
              <div><strong>{name}</strong><small>{remaining} pendiente(s){unitPriceCents !== undefined && ` · ${format(unitPriceCents)} c/u`}</small></div>
              <Stepper label={`cantidad de ${name}`} min={0} max={remaining} value={Math.min(quantities[id] ?? 0, remaining)}
                change={(value) => setQuantities((current) => ({ ...current, [id]: value }))} />
            </div>)}
        </fieldset>}
        <fieldset disabled={busy}><legend>Propina</legend>
          <div className={styles.segmented}>
            {([0, 10, 15, "CUSTOM"] as const).map((value) =>
              <button type="button" key={value} aria-pressed={tip === value} onClick={() => setTip(value)}>{value === "CUSTOM" ? "Otra" : `${value}%`}</button>)}
          </div>
          {tip === "CUSTOM" && <label className={styles.field}>Monto de propina
            <input inputMode="decimal" placeholder="0.00" value={custom} onChange={(event) => setCustom(event.target.value)} required />
          </label>}
        </fieldset>
        <fieldset disabled={busy}><legend>Método de pago</legend>
          <label className={styles.field}><span>Método</span>
            <select value={method} onChange={(event) => setMethod(event.target.value as PayInput["method"])}>
              {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.field}>Correo para recibo <span>Opcional</span><input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="correo@ejemplo.com" /></label>
        </fieldset>
        <fieldset disabled={busy}><legend>Califica tu experiencia <span>Opcional</span></legend>
          <div className={styles.stars}>
            {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-pressed={value === stars} aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
              onClick={() => setStars(stars === value ? 0 : value)}><Star size={25} fill={value <= stars ? "currentColor" : "none"} /></button>)}
          </div>
          {stars > 0 && <label className={styles.field}>Comentario <span>Opcional</span><textarea rows={2} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} /></label>}
        </fieldset>
        {shown && <dl className={styles.totals}>
          <div><dt>Subtotal</dt><dd>{format(shown.subtotalCents)}</dd></div>
          <div><dt>Impuestos</dt><dd>{format(shown.taxCents)}</dd></div>
          <div><dt>Propina</dt><dd>{format(shown.tipCents)}</dd></div>
          <div><dt>Total de este pago</dt><dd>{format(shown.totalCents)}</dd></div>
        </dl>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button type="submit" className={styles.primary} disabled={busy || (mode === "ITEMS" && !selectedItems.length)}>
          <CreditCard size={18} /> {busy ? "Procesando…" : !shown ? "Calcular total" : method === "CARD_ONLINE" ? `Pagar ${format(shown.totalCents)}` : `Solicitar pago de ${format(shown.totalCents)}`}
        </button>
      </form>}
  </Dialog>;
}
