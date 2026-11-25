"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { adminProductSchema, createAdminSchema } from "@/lib/admin-validation";
import { restaurantSettingsSchema } from "@/lib/validators";

import { StaffDialog } from "../staff/board-ui";
import { errorMessage, menuTags } from "../staff/data";
import { resourceLabels, type AdminData, type CreateInput, type EditorTarget, type ModifierInput } from "./types";
import styles from "./admin.module.css";

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function integer(form: FormData, name: string) {
  const value = text(form, name);
  return value ? Number(value) : NaN;
}

function decimal(value: string) {
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN;
}

const names = Object.entries(menuTags) as [keyof typeof menuTags, string][];

function Tags({ tags, change }: { tags: (keyof typeof menuTags)[]; change: (tags: (keyof typeof menuTags)[]) => void }) {
  return <div className={styles.checks}>{names.map(([tag, name]) => <label key={tag}>
    <input type="checkbox" checked={tags.includes(tag)} onChange={(event) =>
      change(event.target.checked ? [...tags, tag] : tags.filter((value) => value !== tag))} />{name}
  </label>)}</div>;
}

export function FormAction({ children, label, onSave }: {
  children: ReactNode; label: string; onSave: (form: FormData) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);

  async function submit(form: FormData) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try { await onSave(form); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { running.current = false; setBusy(false); }
  }

  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)); }}>
    <fieldset disabled={busy}>{children}</fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button type="submit" className={styles.primary} disabled={busy}>{busy ? "Procesando…" : label}</button>
  </form>;
}

export function Editor({ target, data, close, save }: {
  target: EditorTarget; data: AdminData; close: () => void; save: (input: CreateInput, id?: string) => Promise<boolean>;
}) {
  const { kind, record } = target;
  const title = record ? `Editar ${resourceLabels[kind].singular}` : resourceLabels[kind].create;
  const submit = async (values: unknown) => {
    const input = createAdminSchema.parse({ kind, values });
    if (await save(input, record?.id)) close();
  };
  return <StaffDialog title={title} close={close}>
    {kind === "product" ? <ProductForm initial={target.record} data={data} onSave={submit} /> :
      kind === "question" ? <QuestionForm initial={target.record} onSave={submit} /> :
        <FormAction label="Guardar cambios" onSave={(form) => {
          if (kind === "table") return submit({ number: integer(form, "number") });
          return submit({ name: text(form, "name"), ...(kind === "category" ? { sortOrder: integer(form, "sortOrder") } : {}) });
        }}>
          {kind === "table" ? <label>Número de mesa
            <input name="number" type="number" min={1} max={9999} defaultValue={target.record?.number} required />
          </label> : <>
            <label>Nombre<input name="name" maxLength={120} defaultValue={target.record?.name} required /></label>
            {kind === "category" && <label>Orden en el menú
              <input name="sortOrder" type="number" min={0} max={1000} defaultValue={target.record?.sortOrder ?? 0} required />
            </label>}
          </>}
        </FormAction>}
  </StaffDialog>;
}

function ProductForm({ initial, data, onSave }: {
  initial?: AdminData["products"][number]; data: AdminData; onSave: (values: unknown) => Promise<void>;
}) {
  const [tags, setTags] = useState(initial?.tags ?? []);
  const [modifiers, setModifiers] = useState(() => (initial?.modifiers ?? []).map((fields, key) => ({
    key, fields, amount: (fields.priceDeltaCents / 100).toFixed(2),
  })));
  const nextKey = useRef(modifiers.length);
  function update(key: number, fields: Partial<ModifierInput>, amount?: string) {
    setModifiers((rows) => rows.map((row) => row.key === key ? { ...row, fields: { ...row.fields, ...fields }, amount: amount ?? row.amount } : row));
  }

  return <FormAction label="Guardar producto" onSave={(form) => onSave(adminProductSchema.parse({
    name: text(form, "name"), description: text(form, "description") || undefined, imageUrl: text(form, "imageUrl") || undefined,
    categoryId: text(form, "categoryId"), stationId: text(form, "stationId"),
    priceCents: decimal(text(form, "price")), spiceLevel: integer(form, "spiceLevel"),
    available: form.has("available"), tags,
    modifiers: modifiers.map(({ fields, amount }) => ({ ...fields, priceDeltaCents: decimal(amount) })),
  }))}>
    <label>Nombre<input name="name" defaultValue={initial?.name} required maxLength={120} /></label>
    <div className={styles.fieldPair}>
      <label>Categoría<select name="categoryId" defaultValue={initial?.categoryId ?? ""} required>
        <option value="" disabled>Selecciona una categoría</option>
        {data.categories.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
      </select></label>
      <label>Estación<select name="stationId" defaultValue={initial?.stationId ?? ""} required>
        <option value="" disabled>Selecciona una estación</option>
        {data.stations.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
      </select></label>
    </div>
    <div className={styles.fieldPair}>
      <label>Precio ({data.restaurant.currency})<input name="price" inputMode="decimal" placeholder="0.00"
        defaultValue={initial ? (initial.priceCents / 100).toFixed(2) : ""} required /></label>
      <label>Picante (0–5)<input name="spiceLevel" type="number" min={0} max={5} defaultValue={initial?.spiceLevel ?? 0} required /></label>
    </div>
    <label>Descripción<textarea name="description" rows={2} maxLength={1000} defaultValue={initial?.description ?? ""} /></label>
    <label>URL de imagen<input name="imageUrl" maxLength={2048} defaultValue={initial?.imageUrl ?? ""} placeholder="https://…" /></label>
    <div role="group" aria-label="Etiquetas y alérgenos"><strong>Etiquetas y alérgenos</strong><Tags tags={tags} change={setTags} /></div>
    <label className={styles.check}><input name="available" type="checkbox" defaultChecked={initial?.available ?? false} /> Mostrar en el menú</label>
    <div className={styles.groupHeading}><strong>Variantes y extras</strong>
      <button type="button" className={styles.secondary} disabled={modifiers.length >= 30} onClick={() => {
        const key = nextKey.current++;
        setModifiers((rows) => [...rows, { key, fields: { name: "", kind: "EXTRA", tags: [], priceDeltaCents: 0, available: true }, amount: "0.00" }]);
      }}><Plus size={16} /> Agregar opción</button>
    </div>
    {modifiers.map(({ key, fields, amount }, index) => <div className={styles.modifier} key={key}>
      <div className={styles.groupHeading}><strong>Opción {index + 1}</strong>
        <button type="button" className={styles.secondary} aria-label={`Quitar opción ${index + 1}`}
          onClick={() => setModifiers((rows) => rows.filter((row) => row.key !== key))}><Trash2 size={15} /></button></div>
      <label>Nombre de opción<input value={fields.name} maxLength={120} required
        onChange={(event) => update(key, { name: event.target.value })} /></label>
      <div className={styles.fieldPair}>
        <label>Tipo<select value={fields.kind} onChange={(event) => update(key, { kind: event.target.value === "SIZE" ? "SIZE" : "EXTRA" })}>
          <option value="EXTRA">Extra</option><option value="SIZE">Tamaño</option>
        </select></label>
        <label>Costo adicional<input inputMode="decimal" required value={amount} onChange={(event) => update(key, {}, event.target.value)} /></label>
      </div>
      <Tags tags={fields.tags} change={(options) => update(key, { tags: options })} />
      <label className={styles.check}><input type="checkbox" checked={fields.available} onChange={(event) => update(key, { available: event.target.checked })} /> Disponible</label>
    </div>)}
  </FormAction>;
}

function QuestionForm({ initial, onSave }: {
  initial?: AdminData["questions"][number]; onSave: (values: unknown) => Promise<void>;
}) {
  const [options, setOptions] = useState(initial?.options ?? ["", "", "", ""]);
  const [correct, setCorrect] = useState(initial?.correctIndex ?? 0);
  const locked = Boolean(initial?._count.rounds);
  return <FormAction label="Guardar pregunta" onSave={(form) => onSave({
    prompt: locked ? initial?.prompt : text(form, "prompt"),
    options, correctIndex: correct, available: form.has("available"),
  })}>
    {locked && <p className={styles.muted}>Esta pregunta ya se usó. Puedes cambiar su disponibilidad.</p>}
    <label>Pregunta<input name="prompt" defaultValue={initial?.prompt} maxLength={300} required disabled={locked} /></label>
    {options.map((option, index) => <div className={styles.optionRow} key={index}>
      <label>Opción {index + 1}<input value={option} maxLength={120} required disabled={locked}
        onChange={(event) => setOptions((current) => current.map((value, i) => i === index ? event.target.value : value))} /></label>
      <button className={styles.secondary} type="button" disabled={locked || options.length <= 2}
        aria-label={`Quitar opción ${index + 1}`} onClick={() => {
          setOptions((current) => current.filter((_, i) => i !== index));
          setCorrect((value) => value === index ? 0 : value > index ? value - 1 : value);
        }}><Trash2 size={15} /></button>
    </div>)}
    <button type="button" className={styles.secondary} disabled={locked || options.length >= 6} onClick={() => setOptions((current) => [...current, ""])}><Plus size={15} /> Agregar opción</button>
    <label>Respuesta correcta<select value={correct} disabled={locked} onChange={(event) => setCorrect(Number(event.target.value))}>
      {options.map((_, index) => <option value={index} key={index}>Opción {index + 1}</option>)}
    </select></label>
    <label className={styles.check}><input type="checkbox" name="available" defaultChecked={initial?.available ?? true} /> Disponible para rondas</label>
  </FormAction>;
}

export function SettingsForm({ initial, save }: {
  initial: AdminData["restaurant"]; save: (values: ReturnType<typeof restaurantSettingsSchema.parse>) => Promise<unknown>;
}) {
  return <div className={styles.settings}><h2>Wi-Fi e impuestos</h2>
    <FormAction label="Guardar configuración" onSave={(form) => save(restaurantSettingsSchema.parse({
      wifiSsid: text(form, "wifiSsid") || null,
      wifiPassword: String(form.get("wifiPassword") ?? "") || null,
      taxBps: decimal(text(form, "tax")),
    }))}>
      <label>Red Wi-Fi para clientes<input name="wifiSsid" maxLength={32} defaultValue={initial.wifiSsid ?? ""} /></label>
      <label>Contraseña Wi-Fi para clientes<input name="wifiPassword" maxLength={63} defaultValue={initial.wifiPassword ?? ""} /></label>
      <label>Impuesto (%)
        <input name="tax" inputMode="decimal" defaultValue={(initial.taxBps / 100).toFixed(2)} required />
        <small>La tasa se aplica a los pedidos nuevos.</small>
      </label>
    </FormAction>
  </div>;
}
