"use client";

import {
  ArrowRight, Bell, ChevronRight, CircleCheck, ClipboardList, CreditCard, Gamepad2,
  LoaderCircle, ShoppingBag, UsersRound, Utensils, Wifi,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { checkoutSchema, claimSessionSchema, createOrderSchema, sessionActionSchema, startSessionSchema } from "@/lib/validators";

import { readDraft, writeDraft, type Draft } from "./cart-draft";
import { Checkout } from "./checkout";
import {
  lineTotal, message, requestId, tableRequest, RequestError,
  type Alert, type CartLine, type Category, type Dish, type PayInput, type Payment, type Quote, type QuoteInput,
  type Session, type Snapshot,
} from "./data";
import { DishDialog, Menu } from "./menu";
import { Dialog, Stepper } from "./ui";
import { CartDialog, OrdersDialog, TriviaDialog, WaiterButton, WifiDialog } from "./utilities";
import styles from "./mesa.module.css";

type Modal = "start" | "wifi" | "trivia" | "orders" | "cart" | "checkout";
type PaymentResult = { payment: Payment; closed: boolean };
type Attempt = { signature: string; id: string };

function readToken(key: string) {
  try { return window.localStorage.getItem(key) ?? undefined; }
  catch { return undefined; }
}

function storeToken(key: string, token?: string) {
  try {
    if (token) window.localStorage.setItem(key, token);
    else window.localStorage.removeItem(key);
  } catch {
    // Private storage may be unavailable. The current page still holds the token in memory.
  }
}

function intentId(attempt: { current: Attempt | null }, payload: unknown) {
  const signature = JSON.stringify(payload);
  if (attempt.current?.signature !== signature) attempt.current = { signature, id: requestId() };
  return attempt.current.id;
}

export function Mesa({ restaurantSlug, tableCode }: { restaurantSlug: string; tableCode: string }) {
  const base = `/api/r/${restaurantSlug}/mesa/${tableCode}`;
  const tokenKey = `restaurantes:host:${restaurantSlug}:${tableCode}`;
  const draftKey = `${tokenKey}:draft`;
  const token = useRef<string | undefined>(undefined);
  const draftRef = useRef<Draft | null>(null);
  const sessionReads = useRef(0);
  const menuReads = useRef(0);
  const menuLoading = useRef(false);
  const ordering = useRef(false);
  const calling = useRef(false);
  const paymentRetry = useRef<Attempt | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingPayment, setPendingPayment] = useState<{ id: string; sessionId: string } | null>(null);
  const [actionError, setActionError] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [dish, setDish] = useState<Dish | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [cartError, setCartError] = useState("");
  const [triviaVersion, setTriviaVersion] = useState(0);

  const saveDraft = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
    writeDraft(draftKey, next);
  }, [draftKey]);

  const setToken = useCallback((value?: string) => {
    if (token.current !== value) saveDraft(null);
    token.current = value;
    storeToken(tokenKey, value);
  }, [saveDraft, tokenKey]);

  const refreshSession = useCallback(async () => {
    const version = ++sessionReads.current;
    const usedToken = token.current;
    try {
      const next = await tableRequest<Snapshot>(base + "/session", { token: usedToken });
      if (version !== sessionReads.current || usedToken !== token.current) return;
      if (usedToken && next.active?.session.role !== "HOST") setToken();
      setSnapshot(next);
      setConnectionError("");
      return next;
    } catch (failure) {
      if (version === sessionReads.current) setConnectionError(message(failure));
    }
  }, [base, setToken]);

  const refreshMenu = useCallback(async (background = false) => {
    if (background && menuLoading.current) return;
    const version = ++menuReads.current;
    if (!background) {
      menuLoading.current = true;
      setLoadingMenu(true);
    }
    try {
      const { categories: next } = await tableRequest<{ categories: Category[] }>(base + "/menu");
      if (version !== menuReads.current) return;
      setCategories(next);
      setMenuError("");
    } catch (failure) {
      if (!background && version === menuReads.current) setMenuError(message(failure));
    } finally {
      if (!background && version === menuReads.current) {
        menuLoading.current = false;
        setLoadingMenu(false);
      }
    }
  }, [base]);

  useEffect(() => {
    let mounted = true;
    token.current = readToken(tokenKey);
    async function initialize() {
      const next = await refreshSession();
      if (!mounted || !next?.active?.session.canClaim) return;
      try {
        const claim = await tableRequest<{ session: Session; hostToken?: string }>(base + "/session", {
          token: token.current, body: claimSessionSchema.parse({}),
        });
        if (claim.hostToken) setToken(claim.hostToken);
        if (mounted) await refreshSession();
      } catch (failure) {
        if (mounted) setActionError(message(failure));
      }
    }
    void initialize();
    void refreshMenu();
    return () => { mounted = false; sessionReads.current++; menuReads.current++; };
  }, [base, refreshMenu, refreshSession, setToken, tokenKey]);

  const restaurantId = snapshot?.restaurant.id;
  useEffect(() => {
    if (!restaurantId) return;
    const events = new EventSource(`/api/realtime/${restaurantId}?tableCode=${encodeURIComponent(tableCode)}`);
    const sync = () => {
      void refreshSession();
      void refreshMenu(true);
      setTriviaVersion((version) => version + 1);
    };
    const change = (event: MessageEvent<string>) => {
      const { topic } = JSON.parse(event.data) as { topic: string };
      if (topic === "trivia") setTriviaVersion((version) => version + 1);
      else if (topic === "catalog") void refreshMenu(true);
      else void refreshSession();
    };
    const visible = () => { if (document.visibilityState === "visible") sync(); };
    const stored = (event: StorageEvent) => {
      if (event.key !== tokenKey) return;
      const next = readToken(tokenKey);
      if (next !== token.current) saveDraft(null);
      token.current = next;
      sync();
    };
    events.addEventListener("sync", sync);
    events.addEventListener("change", change);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", stored);
    return () => {
      events.close();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", stored);
    };
  }, [restaurantId, tableCode, refreshSession, refreshMenu, saveDraft, tokenKey]);

  const active = snapshot?.active ?? null;
  const host = active?.session.role === "HOST";
  const sessionId = active?.session.id;
  const checkoutStarted = active?.payments?.some(({ status }) => status !== "CANCELLED") ?? false;
  const canOrder = host && !checkoutStarted;
  const draftLines = host && draft?.sessionId === sessionId ? draft?.lines ?? [] : [];
  const products = new Map(categories.flatMap(({ items }) => items.map((item) => [item.id, item] as const)));
  const unavailable: { id: string; name: string }[] = [];
  const cart = draftLines.flatMap(({ id, name, menuItemId, modifierIds, quantity, notes }) => {
    const product = products.get(menuItemId);
    const modifiers = product?.modifiers.filter(({ id }) => modifierIds.includes(id)) ?? [];
    if (!product || modifiers.length !== modifierIds.length) {
      unavailable.push({ id, name });
      return [];
    }
    return [{ id, dish: product, modifiers, quantity, notes: notes ?? "" }];
  });
  const cartCount = draftLines.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0);
  const orderCount = active?.orders.length ?? 0;
  const menuReady = !loadingMenu && !menuError;

  useEffect(() => {
    paymentRetry.current = null;
    setCartError("");
    if (host && sessionId) {
      const restored = readDraft(draftKey, sessionId);
      draftRef.current = restored;
      setDraft(restored);
    } else {
      draftRef.current = null;
      setDraft(null);
      setModal((current) => current === "cart" || current === "checkout" ? null : current);
    }
  }, [draftKey, host, sessionId]);

  function changeQuantity(id: string, quantity: number) {
    if (!canOrder || !sessionId || ordering.current) return;
    const lines = (draftRef.current?.lines ?? []).flatMap((item) => item.id !== id ? [item] : quantity ? [{ ...item, quantity }] : []);
    saveDraft(lines.length ? { sessionId, requestId: requestId(), lines } : null);
    setCartError("");
  }

  function addLine(line: CartLine) {
    if (!canOrder || !sessionId || ordering.current) return;
    const lines = draftRef.current?.lines ?? [];
    if (lines.length >= 30) throw new RequestError("Envía esta ronda antes de agregar más platillos.", 422);
    saveDraft({ sessionId, requestId: requestId(), lines: [...lines, {
      id: line.id, name: line.dish.name, menuItemId: line.dish.id,
      modifierIds: line.modifiers.map(({ id }) => id), quantity: line.quantity, notes: line.notes,
    }] });
    setCartError("");
    setDish(null);
  }

  useEffect(() => {
    if (!pendingPayment || !snapshot) return;
    if (active?.session.id !== pendingPayment.sessionId) {
      setNotice("La sesión de la mesa se cerró.");
      setPendingPayment(null);
      return;
    }
    const status = active.payments?.find(({ id }) => id === pendingPayment.id)?.status;
    if (!status || status === "PENDING") return;
    setNotice(status === "PAID" ? "Pago en mesa confirmado." : "El pago en mesa fue cancelado.");
    setPendingPayment(null);
  }, [active, pendingPayment, snapshot]);

  function selectModal(value: Modal) {
    setActionError("");
    if (value === "checkout" && canOrder && draftRef.current?.lines.length) {
      setCartError("Envía o quita los productos del carrito antes de abrir la cuenta.");
      setModal("cart");
      return;
    }
    setModal(value);
  }

  async function openTable(guestCount: number, hostName: string) {
    const result = await tableRequest<{ session: Session; hostToken?: string }>(base + "/session", {
      body: startSessionSchema.parse({ guestCount, hostName: hostName.trim() || undefined }),
    });
    if (result.hostToken) setToken(result.hostToken);
    await refreshSession();
    setModal(null);
    setNotice(result.hostToken ? "Mesa abierta. Ya puedes enviar pedidos." : "La mesa ya tiene anfitrión.");
  }

  async function sendOrder() {
    const current = draftRef.current;
    const usedToken = token.current;
    if (!canOrder || !sessionId || !usedToken || ordering.current || !current?.lines.length ||
        current.sessionId !== sessionId || !menuReady || unavailable.length) return;
    ordering.current = true;
    setSendBusy(true);
    setCartError("");
    try {
      const payload = { sessionId, requestId: current.requestId,
        items: current.lines.map(({ menuItemId, modifierIds, quantity, notes }) => ({ menuItemId, modifierIds, quantity, notes })) };
      await tableRequest(base + "/orders", {
        token: usedToken, body: createOrderSchema.parse(payload),
      });
      if (usedToken !== token.current) return;
      saveDraft(null);
      setModal(null);
      setNotice("Pedido enviado a cocina.");
      await refreshSession();
    } catch (failure) {
      setCartError(message(failure));
      if (failure instanceof RequestError && (failure.status === 403 || failure.status === 409)) await refreshSession();
    } finally {
      ordering.current = false;
      setSendBusy(false);
    }
  }

  async function callWaiter() {
    if (!sessionId || !host || calling.current) return;
    calling.current = true;
    setCallBusy(true);
    setActionError("");
    try {
      const { alert } = await tableRequest<{ alert: Alert }>(base + "/alerts", {
        token: token.current, body: sessionActionSchema.parse({ sessionId }),
      });
      setSnapshot((current) => current?.active?.session.id === sessionId
        ? { ...current, active: { ...current.active, alert } }
        : current);
      await refreshSession();
    } catch (failure) {
      setActionError(message(failure));
      await refreshSession();
    } finally {
      calling.current = false;
      setCallBusy(false);
    }
  }

  async function checkoutRequest<T>(suffix: string, body: unknown) {
    try {
      return await tableRequest<T>(base + suffix, { token: token.current, body });
    } catch (failure) {
      if (failure instanceof RequestError && (failure.status === 403 || failure.status === 409)) await refreshSession();
      throw failure;
    }
  }

  function pay(input: Omit<PayInput, "requestId">) {
    return checkoutRequest<PaymentResult>("/checkout", checkoutSchema.parse({ ...input, requestId: intentId(paymentRetry, input) }));
  }

  function paid(result: PaymentResult) {
    paymentRetry.current = null;
    if (result.closed) setToken();
    if (result.payment.status === "PENDING" && sessionId) {
      setPendingPayment({ id: result.payment.id, sessionId });
    }
    setModal(null);
    setNotice(result.payment.status === "PENDING" ? "Pago solicitado. El mesero confirmará el cobro en mesa."
      : result.closed ? "Pago confirmado. Gracias por tu visita." : "Pago parcial confirmado.");
    void refreshSession();
  }

  const format = (cents: number) => new Intl.NumberFormat("es-GT", {
    style: "currency", currency: snapshot?.restaurant.currency ?? "GTQ",
  }).format(cents / 100);
  const name = snapshot?.restaurant.name;

  return <div className={styles.shell}>
    <header className={styles.header}><div className={styles.headerInner}>
      <a href="#menu" className={styles.brand}><span className={styles.brandIcon}><Utensils size={20} /></span><span className={styles.brandName}>{name ?? "Restaurante"}</span></a>
      {snapshot && <>
        <nav className={styles.headerNav} aria-label="Navegación principal">
          <a href="#menu">Menú</a><button type="button" onClick={() => selectModal("orders")}>Pedidos</button><a href="#servicios">Servicios</a>
        </nav>
        <span className={styles.tableBadge} data-active={!!active}>
          <i aria-hidden="true" /><span><strong>Mesa {snapshot.table.number}</strong><small>{host ? "Anfitrión" : active ? "Acompañante" : "Disponible"}</small></span>
        </span>
      </>}
    </div></header>
    <main className={styles.main} data-draft={canOrder && cartCount > 0}>
      {!snapshot ? <div className={styles.loading}>
        {connectionError ? <><h1>{connectionError}</h1><button className={styles.primary} type="button" onClick={() => void refreshSession()}>Volver a intentar</button></>
          : <p role="status"><LoaderCircle size={20} className={styles.spin} /> Cargando la mesa…</p>}
      </div> : <>
        <div className={styles.intro}>
          <section className={styles.hero} aria-label={name}>
            <div className={styles.heroContent}>
              <span className={styles.heroKicker}>Menú en mesa</span>
              <h1>{name}</h1>
              <a href="#menu">Explorar el menú <ArrowRight size={18} /></a>
            </div>
          </section>
          <section className={styles.tablePanel} data-host={host} aria-label="Sesión de la mesa">
            <div className={styles.tablePanelHeading}>
              <span className={styles.welcomeIcon}><UsersRound size={22} /></span>
              <div><h2>{active ? "Tu mesa" : "Abre tu mesa"}</h2>
                <p>Mesa {snapshot.table.number}{active && ` · ${active.session.guestCount} ${active.session.guestCount === 1 ? "persona" : "personas"}`}</p>
              </div>
            </div>
            {!active && <>
              <p className={styles.muted}>Indica cuántas personas vienen contigo para empezar a pedir.</p>
              <button className={styles.primary} type="button" onClick={() => selectModal("start")}>Iniciar sesión de mesa <ArrowRight size={18} /></button>
            </>}
            {active && !host && <div className={styles.roleInfo}>
              <strong>Modo acompañante</strong><p>{active.session.canClaim
                ? "El control está disponible. Acerca tu celular a la placa NFC para tomarlo."
                : "Puedes ver el menú, seguir los pedidos y jugar. El anfitrión ordena y paga."}</p>
            </div>}
            {host && <p className={styles.hostLabel}>Anfitrión{active?.session.hostName && ` · ${active.session.hostName}`}</p>}
            <div className={styles.tableActions}>
              <button type="button" className={`${styles.utility} ${styles.mobileDuplicate}`} onClick={() => selectModal("orders")}><ClipboardList size={19} />
                <span>Pedidos{orderCount ? ` · ${orderCount}` : ""}</span><ChevronRight size={16} /></button>
              {host && canOrder && <button type="button" className={`${styles.utility} ${styles.mobileDuplicate}`} onClick={() => selectModal("cart")}><ShoppingBag size={19} />
                <span>Carrito{cartCount ? ` · ${cartCount}` : ""}</span><ChevronRight size={16} /></button>}
              {host && <button type="button" className={styles.utility} disabled={!orderCount} onClick={() => selectModal("checkout")}><CreditCard size={19} />
                <span>Ver cuenta</span><ChevronRight size={16} /></button>}
            </div>
            {checkoutStarted && <p className={styles.muted}>{active?.payments?.some(({ status }) => status === "PENDING") ? "Pago pendiente de confirmación." : "Cuenta en proceso de pago."}</p>}
          </section>
        </div>
        {(notice || connectionError || actionError) && <div className={styles.feedback}>
          {notice && <div className={styles.notice} role="status"><CircleCheck size={19} /><p>{notice}</p>
            <button className={styles.textButton} type="button" onClick={() => setNotice("")}>Cerrar aviso</button></div>}
          {connectionError && <p className={styles.error} role="alert">{connectionError} <button type="button" className={styles.textButton} onClick={() => void refreshSession()}>Reintentar</button></p>}
          {actionError && <p className={styles.error} role="alert">{actionError}</p>}
        </div>}
        <section id="servicios" className={styles.serviceBar} aria-label="Servicios de la mesa">
          <button type="button" className={styles.utility} onClick={() => selectModal("wifi")}><span className={styles.utilityIcon}><Wifi size={19} /></span>
            <span>Wi-Fi</span><ChevronRight size={16} /></button>
          <button type="button" className={styles.utility} onClick={() => selectModal("trivia")}><span className={styles.utilityIcon}><Gamepad2 size={19} /></span>
            <span>Trivia en vivo</span><ChevronRight size={16} /></button>
          {host && <div className={styles.waiterService}><WaiterButton alert={active?.alert ?? null} busy={callBusy} call={() => void callWaiter()} /></div>}
        </section>
        <div className={styles.layout}>
          {loadingMenu ? <p role="status" className={styles.loading}>Cargando el menú…</p>
            : menuError ? <div className={styles.empty}><p role="alert">{menuError}</p><button type="button" className={styles.secondary} onClick={() => void refreshMenu()}>Reintentar menú</button></div>
              : <Menu categories={categories} canOrder={canOrder} format={format} open={(item) => { setModal(null); setDish(item); }} />}
        </div>
        {canOrder && cartCount > 0 && <div className={styles.mobileCart}>
          <button type="button" onClick={() => selectModal("cart")}>
            <ShoppingBag size={19} /><span>Ver carrito <small>· {cartCount} {cartCount === 1 ? "producto" : "productos"}</small></span>
            {menuReady && !unavailable.length && <strong>{format(subtotal)}</strong>}
            <ChevronRight size={18} />
          </button>
        </div>}
        <nav className={styles.bottomNav} aria-label="Accesos de la mesa">
          <a href="#menu" className={styles.menuNav}><Utensils size={20} /> Menú</a>
          <button type="button" onClick={() => selectModal("orders")}><ClipboardList size={20} /> Pedidos</button>
          <a href="#servicios"><Bell size={20} /> Servicios</a>
          {canOrder && !cartCount && !orderCount && <button type="button" className={styles.cartNav} onClick={() => selectModal("cart")}><ShoppingBag size={20} /> Carrito</button>}
          {host && orderCount > 0 && <button type="button" className={styles.cartNav} onClick={() => selectModal("checkout")}><CreditCard size={20} /> Cuenta</button>}
        </nav>
        {modal === "start" && !active && <OpenDialog open={openTable} close={() => setModal(null)} />}
        {modal === "orders" && <OrdersDialog active={active} format={format} close={() => setModal(null)} />}
        {modal === "wifi" && <WifiDialog ssid={snapshot.restaurant.wifiSsid} password={snapshot.restaurant.wifiPassword} close={() => setModal(null)} />}
        {modal === "trivia" && <TriviaDialog path={base + "/trivia"} sessionId={sessionId} refreshVersion={triviaVersion} tableNumber={snapshot.table.number} close={() => setModal(null)} />}
        {modal === "cart" && canOrder && <CartDialog cart={cart} format={format} busy={sendBusy} error={cartError} close={() => setModal(null)}
          unavailable={unavailable} menuReady={menuReady} refresh={() => void refreshMenu()}
          send={() => void sendOrder()} change={changeQuantity} />}
        {modal === "checkout" && host && active && <Checkout active={active} format={format} close={() => setModal(null)}
          quote={(input: QuoteInput) => checkoutRequest<Quote>("/checkout/quote", input)} pay={pay} completed={paid} />}
        {dish && <DishDialog key={dish.id} dish={dish} canOrder={canOrder} format={format} close={() => setDish(null)} add={addLine} />}

      </>}
    </main>
  </div>;
}

function OpenDialog({ open, close }: {
  open: (count: number, name: string) => Promise<void>; close: () => void;
}) {
  const [count, setCount] = useState(2);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try { await open(count, name); }
    catch (failure) { setError(message(failure)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <Dialog title="Abre tu mesa" close={() => { if (!busy) close(); }}>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div className={styles.quantityRow}><span>¿Cuántas personas son?</span><Stepper label="personas" change={setCount} value={count} disabled={busy} /></div>
      <label className={styles.field}>Tu nombre <span>Opcional</span><input value={name} maxLength={80} disabled={busy} autoComplete="given-name" onChange={(event) => setName(event.target.value)} /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="submit" disabled={busy} className={styles.primary}>{busy ? "Abriendo…" : "Abrir mesa"} <ArrowRight size={18} /></button>
    </form>
  </Dialog>;
}
