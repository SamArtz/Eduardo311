"use client";

import { ArrowRight, CookingPot, KeyRound, Settings2, Workflow } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { credentialsSchema, errorMessage, staffRequest, type Credentials, type Section } from "./data";
import styles from "./staff.module.css";

const storageKey = "restaurantes:staff";
const Context = createContext<{ credentials: Credentials; section: Section; signOut: () => void } | null>(null);

export function useStaff() {
  const context = useContext(Context);
  if (!context) throw new Error("Pantalla de personal sin contexto");
  return context;
}

export function StaffAccess({ section, children }: { section: Section; children: ReactNode }) {
  const [credentials, setCredentials] = useState<Credentials>();
  const [ready, setReady] = useState(false);
  const [restaurantId, setRestaurantId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signingIn = useRef(false);

  useEffect(() => {
    try {
      const result = credentialsSchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey) ?? "null"));
      if (result.success) {
        setCredentials(result.data);
        setRestaurantId(result.data.restaurantId);
      }
    } catch {
      // The screen can still run with credentials held in memory.
    }
    setReady(true);
  }, []);

  function signOut() {
    try { sessionStorage.removeItem(storageKey); } catch {}
    setCredentials(undefined);
    setError("");
  }

  async function signIn() {
    if (signingIn.current) return;
    signingIn.current = true;
    setBusy(true);
    setError("");
    try {
      const next = credentialsSchema.parse({ restaurantId: restaurantId.trim(), token: token.trim() });
      await staffRequest(next, section);
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      setCredentials(next);
      setToken("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      signingIn.current = false;
      setBusy(false);
    }
  }

  return <div className={styles.shell} data-section={section}>
    {ready && credentials ? <Context.Provider value={{ credentials, section, signOut }}>{children}</Context.Provider> :
      <main className={styles.access}>
        <div className={styles.accessCard}>
          <div className={styles.accessIcon}>{section === "kds" ? <CookingPot size={28} /> : section === "admin" ? <Settings2 size={28} /> : <Workflow size={28} />}</div>
          <h1>{section === "kds" ? "Cocina" : section === "admin" ? "Administración" : "Meseros"}</h1>
          <p>Ingresa con la credencial de tu restaurante.</p>
          {ready && <form onSubmit={(event) => { event.preventDefault(); void signIn(); }}>
            <label>ID del restaurante<input autoCapitalize="none" autoComplete="off" spellCheck={false}
              maxLength={64} value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)} required disabled={busy} /></label>
            <label>Token del personal<input type="password" autoComplete="off" spellCheck={false}
              maxLength={80} value={token} onChange={(event) => setToken(event.target.value)} required disabled={busy} /></label>
            {error && <p role="alert" className={styles.inlineError}>{error}</p>}
            <button className={styles.primary} type="submit" disabled={busy}><KeyRound size={17} /> {busy ? "Verificando…" : "Abrir panel"} <ArrowRight size={17} /></button>
          </form>}
        </div>
      </main>}
  </div>;
}
