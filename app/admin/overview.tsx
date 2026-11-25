import { Armchair, Clock3, ReceiptText, TrendingUp, UserRound, UsersRound } from "lucide-react";

import { duration } from "../staff/board-ui";
import type { AdminData } from "./types";
import styles from "./admin.module.css";

export function Overview({ data, format }: { data: AdminData; format: (value: number) => string }) {
  const { stats, restaurant } = data;
  const value = (cents: number | null) => cents === null ? "—" : format(cents);
  const max = Math.max(1, ...stats.byHour.map(({ cents }) => cents));
  const date = new Intl.DateTimeFormat("es-GT", { dateStyle: "long", timeZone: "UTC" }).format(new Date(stats.date + "T00:00:00Z"));
  const metrics = [
    { label: "Ventas del día", value: format(stats.salesCents), note: "Cobros confirmados, sin propinas", icon: TrendingUp },
    { label: "Mesas ocupadas", value: `${stats.occupiedTables} / ${stats.totalTables}`, note: "En este momento", icon: Armchair },
    { label: "Comensales activos", value: stats.activeDiners, note: "En sesiones abiertas", icon: UsersRound },
    { label: "Ticket por mesa", value: value(stats.averageTableCents), note: "Promedio por sesión con pago hoy", icon: ReceiptText },
    { label: "Ticket por persona", value: value(stats.averageDinerCents), note: "Promedio por comensal en sesiones con pago hoy", icon: UserRound },
    { label: "Tiempo de respuesta", value: stats.averageResponseSeconds === null ? "—" : duration(stats.averageResponseSeconds), note: "Promedio de alertas atendidas hoy", icon: Clock3 },
  ];

  return <section aria-label="Resumen del día">
    <p className={styles.date}>{date} <span>· {restaurant.timeZone}</span></p>
    <div className={styles.metricGrid}>
      {metrics.map(({ label, value, note, icon: Icon }, index) => <article key={label} className={styles.metric} data-primary={index === 0}>
        <div><span>{label}</span><Icon size={19} aria-hidden="true" /></div>
        <strong>{value}</strong><p>{note}</p>
      </article>)}
    </div>
    <figure className={styles.chart}>
      <figcaption><h2>Ventas por hora</h2><span>{restaurant.currency}</span></figcaption>
      {stats.salesCents === 0 && <p className={styles.muted}>Todavía no hay cobros confirmados para este día.</p>}
      <div className={styles.chartScroll}>
        <ol className={styles.bars} style={{ gridTemplateColumns: `repeat(${stats.byHour.length}, minmax(21px, 1fr))` }}>
          {stats.byHour.map(({ label, cents }, index) => <li key={index} title={`${label} · ${format(cents)}`}>
            <span className={styles.barColumn} aria-label={`${label} · ${format(cents)}`}>
              <i style={{ height: `${Math.round(100 * cents / max)}%` }} />
            </span>
            <span className={styles.barLabel}>{index % 3 === 0 ? label : "·"}</span>
          </li>)}
        </ol>
      </div>
      <details className={styles.chartDetails}><summary>Ver importes por hora</summary>
        <dl>{stats.byHour.map(({ label, cents }, index) => <div key={index}><dt>{label}</dt><dd>{format(cents)}</dd></div>)}</dl>
      </details>
    </figure>
  </section>;
}
