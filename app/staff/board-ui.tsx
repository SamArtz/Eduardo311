"use client";

import { Activity, CheckCircle2, Flame, LogOut, RefreshCw, Utensils, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { Restaurant } from "./data";
import { useStaff } from "./staff-access";
import styles from "./staff.module.css";

export function BoardFrame({ restaurant, title, connection, refresh, children }: {
  restaurant?: Restaurant; title: string; connection: "connecting" | "live" | "retrying";
  refresh: () => void; children: ReactNode;
}) {
  const { section, signOut } = useStaff();
  const state = { connecting: "Conectando", live: "En vivo", retrying: "Reconectando" }[connection];
  return <>
    <header className={styles.header}><div className={styles.headerInner}>
      <div className={styles.brand}><span><Utensils size={19} /></span><strong>{restaurant?.name ?? "Restaurantes"}</strong></div>
      <nav className={styles.nav} aria-label="Paneles del personal">
        <Link href="/staff/kds" aria-current={section === "kds" ? "page" : undefined}>Cocina</Link>
        <Link href="/staff/waiter" aria-current={section === "waiter" ? "page" : undefined}>Meseros</Link>
        <Link href="/admin" aria-current={section === "admin" ? "page" : undefined}>Administración</Link>
      </nav>
      <div className={styles.tools}>
        <button className={styles.iconButton} type="button" aria-label="Actualizar tablero" title="Actualizar" onClick={refresh}><RefreshCw size={18} /></button>
        <button className={styles.iconButton} type="button" aria-label="Cerrar sesión del personal" title="Cerrar sesión" onClick={signOut}><LogOut size={18} /></button>
      </div>
    </div></header>
    <main className={styles.main}>
      <div className={styles.pageTitle}><h1>{title}</h1><span role="status" className={styles.connection} data-state={connection}><Activity size={15} />{state}</span></div>
      {children}
    </main>
  </>;
}

export function BoardFeedback({ error, message, clear }: { error: string; message: string; clear: () => void }) {
  return <>
    {error && <div className={styles.feedback} role="alert">{error}</div>}
    {message && <div className={styles.feedback} data-success role="status"><CheckCircle2 size={17} /><span>{message}</span>
      <button type="button" className={styles.iconButton} aria-label="Cerrar aviso" onClick={clear}><X size={17} /></button></div>}
  </>;
}

export function Filters({ label, options, value, select }: {
  label: string; options: { value: string; label: string }[]; value: string; select: (value: string) => void;
}) {
  return <div className={styles.filters} role="group" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => select(option.value)}>{option.label}</button>)}
  </div>;
}

export function useClock() {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function elapsed(now: number | undefined, date: string) {
  if (now === undefined) return undefined;
  const start = Date.parse(date);
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : undefined;
}

export function duration(seconds: number | undefined) {
  if (seconds === undefined) return "—:—";
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function OrderTimer({ now, date }: { now: number | undefined; date: string }) {
  const seconds = elapsed(now, date);
  const urgency = seconds === undefined ? "neutral" : seconds < 480 ? "normal" : seconds <= 900 ? "warning" : "late";
  const label = { neutral: "Tiempo del pedido", normal: "En tiempo", warning: "Atención", late: "Con demora" }[urgency];
  return <span className={styles.timer} data-urgency={urgency} title={label} aria-label={`${label} · ${duration(seconds)}`}><Flame size={14} aria-hidden="true" /> <time>{duration(seconds)}</time></span>;
}

export function StaffDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={(event) => { event.preventDefault(); close(); }}>
    <div className={styles.dialogHeading}><h2>{title}</h2>
      <button className={styles.iconButton} type="button" aria-label="Cancelar" onClick={close}><X size={20} /></button></div>
    {children}
  </dialog>;
}
