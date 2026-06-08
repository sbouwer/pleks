"use client"

/**
 * components/parties/partyFields.tsx — shared form primitives for the unified add-party modal
 *
 * Notes:  The "door card" aesthetic from the mockup, rebuilt on dashboard theme tokens (so a colour
 *         tweak is a token change, not a per-field edit). Underline inputs, lettered section labels,
 *         segmented Individual/Company toggle, speciality chips, the stepper, and an inline SA-ID
 *         validity read-out. State is owned by the modal and threaded via f / set / errors.
 */
import { Check, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SA_PROVINCES, COUNTRIES, DEFAULT_COUNTRY } from "@/lib/constants"
import { PARTY_ID_TYPES, COMPANY_FUNCTION_OPTIONS } from "@/lib/parties/partyConfig"
import { validateSAId, type PartyFormState, type PartyErrors, type PartyPerson, type PartyAddressInput, type PartyBankAccountInput } from "@/lib/parties/partyValidation"

type SetFn = (k: keyof PartyFormState, v: string | string[] | boolean) => void

// ── Stepper ─────────────────────────────────────────────────────────────────
export function Stepper({ labels, current }: Readonly<{ labels: string[]; current: number }>) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    <div className="mt-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Step {pad(current + 1)} of {pad(labels.length)} · {labels[current]}
      </p>
      <div className="mt-2 flex gap-1.5">
        {labels.map((l, i) => (
          <span
            key={l}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < current && "bg-primary/60",
              i === current && "bg-primary",
              i > current && "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  )
}

// ── Section label ("01 · PERSONAL DETAILS") ───────────────────────────────────
export function SectLabel({ n, children }: Readonly<{ n?: string; children: React.ReactNode }>) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
      {n && <span className="font-mono text-[11px] font-semibold text-primary">{n}</span>}
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{children}</span>
    </div>
  )
}

// ── Field shell + inputs ──────────────────────────────────────────────────────
export function Field({
  label, required, error, span, children,
}: Readonly<{ label: string; required?: boolean; error?: string; span?: boolean; children: React.ReactNode }>) {
  return (
    <div className={cn("space-y-1", span && "sm:col-span-2")}>
      <label className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}{required && <span className="text-primary"> *</span>}
      </label>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </div>
  )
}

const inputCls = (err?: boolean) =>
  cn(
    "w-full border-0 border-b bg-transparent px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground/60",
    // color-scheme on the control itself so the native <select> option popup + date-picker render dark
    // (inherited color-scheme doesn't always reach the OS popup — same reason the portal sets it directly).
    "[color-scheme:dark] focus:outline-none focus:ring-0 transition-colors",
    err ? "border-destructive focus:border-destructive" : "border-input focus:border-primary",
  )

export function TextField({
  label, k, f, set, errors, required, span, type = "text", placeholder,
}: Readonly<{
  label: string; k: keyof PartyFormState; f: PartyFormState; set: SetFn; errors: PartyErrors
  required?: boolean; span?: boolean; type?: string; placeholder?: string
}>) {
  return (
    <Field label={label} required={required} error={errors[k]} span={span}>
      <input
        className={inputCls(!!errors[k])}
        type={type}
        value={(f[k] as string) || ""}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  )
}

export function SelectField({
  label, k, f, set, options, span,
}: Readonly<{
  label: string; k: keyof PartyFormState; f: PartyFormState; set: SetFn
  options: ReadonlyArray<{ value: string; label: string }>; span?: boolean
}>) {
  return (
    <Field label={label} span={span}>
      <select
        className={cn(inputCls(false), "appearance-none")}
        value={(f[k] as string) || options[0].value}
        onChange={(e) => set(k, e.target.value)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

/** ID type + number with an inline SA-ID validity read-out (DOB / gender / citizenship). */
export function IdField({
  label, typeKey, numKey, f, set, errors, required,
}: Readonly<{
  label: string; typeKey: keyof PartyFormState; numKey: keyof PartyFormState
  f: PartyFormState; set: SetFn; errors: PartyErrors; required?: boolean
}>) {
  const isSaId = ((f[typeKey] as string) || "sa_id") === "sa_id"
  const v = isSaId ? validateSAId(f[numKey] as string) : null
  const dobStr = v?.dob ? v.dob.toLocaleDateString("en-ZA") : ""
  return (
    <>
      <SelectField label={`${label} type`} k={typeKey} f={f} set={set} options={PARTY_ID_TYPES} />
      <Field label={`${label} number`} required={required} error={errors[numKey]}>
        <input
          className={inputCls(!!errors[numKey])}
          value={(f[numKey] as string) || ""}
          placeholder={isSaId ? "13-digit SA ID" : "Passport / permit number"}
          onChange={(e) => set(numKey, e.target.value)}
        />
        {v && (
          <span className={cn("mt-1 block text-xs", v.valid ? "text-emerald-600" : "text-destructive")}>
            {v.valid
              ? `Valid · ${dobStr} · ${v.gender} · ${v.citizenship}`
              : "Checksum doesn't validate — check the number"}
          </span>
        )}
      </Field>
    </>
  )
}

// ── Segmented Individual / Company ────────────────────────────────────────────
export function EntityToggle({
  entity, onChange,
}: Readonly<{ entity: "individual" | "company"; onChange: (v: "individual" | "company") => void }>) {
  return (
    <div className="inline-flex rounded-[var(--r-button)] border border-border bg-muted/40 p-1" role="tablist" aria-label="Party type">
      {(["individual", "company"] as const).map((v) => {
        const on = entity === v
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(v)}
            className={cn(
              "flex items-center gap-2 rounded-[var(--r-button)] px-4 py-1.5 text-sm font-medium transition-colors",
              on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-primary" : "bg-muted-foreground/40")} />
            {v === "individual" ? "Individual" : "Company"}
          </button>
        )
      })}
    </div>
  )
}

// ── Speciality chips ──────────────────────────────────────────────────────────
export function ChipPicker({
  value, onChange, options,
}: Readonly<{ value: string[]; onChange: (v: string[]) => void; options: readonly string[] }>) {
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((s) => {
        const on = value.includes(s)
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(s)}
            className={cn(
              "inline-flex items-center gap-1 rounded-[var(--r-button)] border px-3 py-1 text-xs font-medium transition-colors",
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {on && <Check className="h-3 w-3" strokeWidth={2.4} />}{s}
          </button>
        )
      })}
    </div>
  )
}

// ── People repeater (company contacts, ADDENDUM_25A) ──────────────────────────
const FUNCTION_SELECT_OPTIONS = [{ value: "", label: "Select…" }, ...COMPANY_FUNCTION_OPTIONS]

function Bare({
  label, value, onChange, required, type = "text", placeholder,
}: Readonly<{ label: string; value?: string; onChange: (v: string) => void; required?: boolean; type?: string; placeholder?: string }>) {
  return (
    <Field label={label} required={required}>
      <input className={inputCls(false)} type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

function BareSelect({
  label, value, onChange, options, required,
}: Readonly<{ label: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ value: string; label: string }>; required?: boolean }>) {
  return (
    <Field label={label} required={required}>
      <select className={cn(inputCls(false), "appearance-none")} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

const ADDRESS_PROVINCE_OPTIONS = [{ value: "", label: "Province…" }, ...SA_PROVINCES.map((p) => ({ value: p, label: p }))]
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c, label: c }))

/** One typed address (25A multi-address). Writes a patch back into the parent's addresses array. Contacts can be
 *  abroad: country defaults to South Africa; the province becomes a free-text state/region off South Africa. */
export function AddressFields({
  address, onUpdate, requiredLine,
}: Readonly<{ address: PartyAddressInput; onUpdate: (patch: Partial<PartyAddressInput>) => void; requiredLine?: boolean }>) {
  const country = address.country ?? DEFAULT_COUNTRY
  const isSA = country === DEFAULT_COUNTRY
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      <Bare label="Street address" required={requiredLine} value={address.line1} onChange={(v) => onUpdate({ line1: v })} placeholder="12 Main Road" />
      <Bare label="Address line 2" value={address.line2} onChange={(v) => onUpdate({ line2: v })} placeholder="Optional" />
      <Bare label="Suburb" value={address.suburb} onChange={(v) => onUpdate({ suburb: v })} placeholder="Sea Point" />
      <Bare label="City" required={requiredLine} value={address.city} onChange={(v) => onUpdate({ city: v })} placeholder="Cape Town" />
      {isSA ? (
        <BareSelect label="Province" value={address.province ?? ""} onChange={(v) => onUpdate({ province: v })} options={ADDRESS_PROVINCE_OPTIONS} />
      ) : (
        <Bare label="Province / state" value={address.province} onChange={(v) => onUpdate({ province: v })} placeholder="e.g. Noord-Holland" />
      )}
      <Bare label="Postal code" value={address.postal} onChange={(v) => onUpdate({ postal: v })} placeholder="8005" />
      <BareSelect label="Country" value={country} onChange={(v) => onUpdate({ country: v })} options={COUNTRY_OPTIONS} />
    </div>
  )
}

const ID_TYPE_OPTIONS = PARTY_ID_TYPES.map((t) => ({ value: t.value, label: t.label }))

/** FICA ID capture for a signatory — SA-ID validity read-out inline (passport/permit not checksum-checked). */
function PersonIdFields({ person, onUpdate }: Readonly<{ person: PartyPerson; onUpdate: (patch: Partial<PartyPerson>) => void }>) {
  const isSaId = (person.idType || "sa_id") === "sa_id"
  const v = isSaId ? validateSAId(person.idNumber) : null
  const dobStr = v?.dob ? v.dob.toLocaleDateString("en-ZA") : ""
  return (
    <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      <BareSelect label="ID type" value={person.idType ?? "sa_id"} onChange={(val) => onUpdate({ idType: val })} options={ID_TYPE_OPTIONS} />
      <Field label="ID number" required>
        <input
          className={inputCls(false)}
          value={person.idNumber ?? ""}
          placeholder={isSaId ? "13-digit SA ID" : "Passport / permit number"}
          onChange={(e) => onUpdate({ idNumber: e.target.value })}
        />
        {v && (
          <span className={cn("mt-1 block text-xs", v.valid ? "text-emerald-600" : "text-destructive")}>
            {v.valid ? `Valid · ${dobStr} · ${v.gender} · ${v.citizenship}` : "Checksum doesn't validate — check the number"}
          </span>
        )}
      </Field>
    </div>
  )
}

function PersonCard({
  person, fica, onUpdate, onRemove, onSetPrimary,
}: Readonly<{ person: PartyPerson; fica: boolean; onUpdate: (patch: Partial<PartyPerson>) => void; onRemove: () => void; onSetPrimary: () => void }>) {
  return (
    <div className="rounded-[var(--r-button)] border border-border bg-muted/20 p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
          <input type="radio" name="company-primary-person" checked={!!person.isPrimary} onChange={onSetPrimary} />
          <span>Primary contact</span>
        </label>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove person"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" /> Remove
        </button>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Bare label="First name" required value={person.firstName} onChange={(v) => onUpdate({ firstName: v })} placeholder="Jane" />
        <Bare label="Last name" required value={person.lastName} onChange={(v) => onUpdate({ lastName: v })} placeholder="Smith" />
        <BareSelect label="Function" required value={person.companyFunction ?? ""} onChange={(v) => onUpdate({ companyFunction: v })} options={FUNCTION_SELECT_OPTIONS} />
        <Bare label="Role / title" value={person.designation} onChange={(v) => onUpdate({ designation: v })} placeholder="e.g. Accounting & Account Mgmt" />
        <Bare label="Email" type="email" value={person.email} onChange={(v) => onUpdate({ email: v })} placeholder="jane@company.co.za" />
        <Bare label="Phone" type="tel" value={person.phone} onChange={(v) => onUpdate({ phone: v })} placeholder="082 000 0000" />
      </div>
      {fica && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
            <input type="checkbox" checked={!!person.isSignatory} onChange={(e) => onUpdate({ isSignatory: e.target.checked })} />
            <span>Signatory — signs for the company (FICA required)</span>
          </label>
          {person.isSignatory && <PersonIdFields person={person} onUpdate={onUpdate} />}
        </div>
      )}
    </div>
  )
}

/**
 * Multi-person editor for a company contact. Each person is a contact under the org; exactly one is the
 * primary (comms fallback). For FICA companies (`fica`), any person can be flagged a signatory (signs for
 * the company → ID captured). The host validates (≥1 person, named/functioned, one primary, ≥1 FICA'd signatory).
 */
export function PeopleRepeater({
  people, onChange, error, fica,
}: Readonly<{ people: PartyPerson[]; onChange: (p: PartyPerson[]) => void; error?: string; fica: boolean }>) {
  const update = (i: number, patch: Partial<PartyPerson>) =>
    onChange(people.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const remove = (i: number) => onChange(people.filter((_, idx) => idx !== i))
  const setPrimary = (i: number) => onChange(people.map((p, idx) => ({ ...p, isPrimary: idx === i })))
  const add = () => onChange([...people, { _uid: crypto.randomUUID(), isPrimary: people.length === 0 }])

  return (
    <div className="space-y-3">
      {people.map((p, i) => (
        <PersonCard
          key={p._uid ?? i}
          person={p}
          fica={fica}
          onUpdate={(patch) => update(i, patch)}
          onRemove={() => remove(i)}
          onSetPrimary={() => setPrimary(i)}
        />
      ))}

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus className="h-4 w-4" /> Add {people.length === 0 ? "a person" : "another person"}
      </button>

      {error && <span className="block text-xs text-destructive">{error}</span>}
    </div>
  )
}

// ── Bank accounts repeater (global multi-account banking, captured at create) ─
const ACCOUNT_TYPE_SELECT = [
  { value: "", label: "Account type…" },
  { value: "cheque", label: "Cheque" },
  { value: "savings", label: "Savings" },
  { value: "transmission", label: "Transmission" },
]

/** Repeatable bank-account inputs (+add) → contact_bank_accounts. The first account persists as primary. */
export function BankAccountsRepeater({
  accounts, onChange,
}: Readonly<{ accounts: PartyBankAccountInput[]; onChange: (a: PartyBankAccountInput[]) => void }>) {
  const update = (i: number, patch: Partial<PartyBankAccountInput>) =>
    onChange(accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const remove = (i: number) => onChange(accounts.filter((_, idx) => idx !== i))
  const add = () => onChange([...accounts, { _uid: crypto.randomUUID() }])

  return (
    <div className="space-y-3">
      {accounts.map((a, i) => (
        <div key={a._uid ?? i} className="rounded-[var(--r-button)] border border-border bg-muted/20 p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Account {i + 1}{i === 0 ? " · primary" : ""}
            </span>
            <button type="button" onClick={() => remove(i)} aria-label="Remove account"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive">
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <Bare label="Bank" value={a.bankName} onChange={(v) => update(i, { bankName: v })} placeholder="FNB" />
            <Bare label="Label (optional)" value={a.label} onChange={(v) => update(i, { label: v })} placeholder="e.g. Municipal account" />
            <Bare label="Account name" value={a.accountName} onChange={(v) => update(i, { accountName: v })} />
            <Bare label="Account number" value={a.accountNumber} onChange={(v) => update(i, { accountNumber: v })} />
            <Bare label="Branch code" value={a.branchCode} onChange={(v) => update(i, { branchCode: v })} />
            <BareSelect label="Account type" value={a.accountType ?? ""} onChange={(v) => update(i, { accountType: v })} options={ACCOUNT_TYPE_SELECT} />
          </div>
        </div>
      ))}

      <button type="button" onClick={add}
        className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
        <Plus className="h-4 w-4" /> Add {accounts.length === 0 ? "a bank account" : "another account"}
      </button>
    </div>
  )
}

// ── Checkbox row (gate = emphasised) ──────────────────────────────────────────
export function CheckRow({
  checked, onChange, gate, children,
}: Readonly<{ checked: boolean; onChange: (v: boolean) => void; gate?: boolean; children: React.ReactNode }>) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[var(--r-button)] border p-3 text-sm",
        gate ? "border-primary/30 bg-primary/[0.03]" : "border-border bg-card",
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span className="leading-snug">{children}</span>
    </label>
  )
}
