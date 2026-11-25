"use client";

import { Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./mesa.module.css";

export function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog ref={dialog} className={styles.dialog} aria-label={title} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }
    }}>
      <div className={styles.dialogHeader}>
        <h2>{title}</h2>
        <button type="button" className={styles.iconButton} aria-label="Cerrar" onClick={close}><X size={20} /></button>
      </div>
      {children}
    </dialog>
  );
}

export function Stepper({ label, value, change, min = 1, max = 20, disabled }: {
  label: string; value: number; change: (value: number) => void; min?: number; max?: number; disabled?: boolean;
}) {
  return <div className={styles.stepper} aria-label={label}>
    <button type="button" aria-label={`Reducir ${label}`} disabled={disabled || value <= min} onClick={() => change(value - 1)}><Minus size={17} /></button>
    <output aria-label={label}>{value}</output>
    <button type="button" aria-label={`Aumentar ${label}`} disabled={disabled || value >= max} onClick={() => change(value + 1)}><Plus size={17} /></button>
  </div>;
}

export function useClock(enabled: boolean, offset = 0) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setNow(Date.now() + offset);
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [enabled, offset]);
  return now;
}

export function minutesSeconds(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
