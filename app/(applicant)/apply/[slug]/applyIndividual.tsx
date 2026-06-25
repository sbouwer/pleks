"use client"

/**
 * app/(applicant)/apply/[slug]/applyIndividual.tsx — the INDIVIDUAL / consumer application flow
 *
 * Notes:  The consumer flow panes (Personal · Address · Employment · Income · Expenses · Documents). A separate
 *         concern from the company flow (applyCompany) — never mixed; the orchestrator (StepPanel) sequences +
 *         renders these. Shares only bricks (form fields, AddressFields, IndividualIdentity) + applyDomain helpers.
 */
import { useState } from "react"
import { AlertCircle, CheckCircle2, FileText, Loader2, Plus, Upload, X } from "lucide-react"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import { IndividualIdentity } from "@/components/parties/partySteps"
import { SectLabel, AddressFields } from "@/components/parties/partyFields"
import type { PartyFormState, PartyErrors } from "@/lib/parties/partyValidation"
import type { DocCategory } from "@/lib/applications/docCategories"
import { formatZAR, startedWithinProbation, PROBATION_MONTHS } from "@/lib/constants"
import {
  type ApplicantType, type CoApplicant, type Emp, type IncomeRow, type IncomePeriod, type SetFn, type DocFile,
  INCOME_CATALOG, COMMITMENT_CATALOG, PERIOD_OPTIONS, SELF_EMPLOYED_TYPES, EMPLOYMENT_OPTIONS, EMPLOYED_TYPES,
  REGISTERED_OPTIONS, YESNO_OPTIONS, moneyCents, rowMonthlyCents, totalMonthlyCents,
} from "./applyDomain"

// ── Step 1 — Personal details ────────────────────────────────────────────────────
export function StepPersonal({ type, commercial, form, set, errors, coApplicants }: Readonly<{ type: ApplicantType; commercial: boolean; form: PartyFormState; set: SetFn; errors: PartyErrors; coApplicants: CoApplicant[] }>) {
  // Spouse candidates for the "my spouse is applying with me" shortcut — co-applicants only (not guarantors).
  const spouseCandidates = coApplicants.filter((c) => c.role === "co_applicant").map((c) => ({ firstName: c.firstName, lastName: c.lastName, email: c.email }))
  let sub: string
  if (type === "company") sub = "Your own details as the contact for the company (a director/signatory). SA ID auto-fills date of birth and gender."
  else if (type === "guarantor") sub = commercial ? "First, the party who'll occupy the premises. You'll add the surety next." : "First, the person who'll live here (the tenant). You'll add the guarantor next."
  else sub = "The main applicant's details. SA ID auto-fills date of birth and gender."
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">{sub}</p>
      <IndividualIdentity f={form} set={set} errors={errors} fullFica sectioned coApplicants={spouseCandidates} />
    </div>
  )
}

// ── Step 2 — Address ─────────────────────────────────────────────────────────────
// Three fixed sections (Current · Postal · Billing) — no add/remove buttons. Current is required; the rest are
// optional. Each section edits the address of its type in the form.addresses array.
const ADDRESS_SECTIONS = [
  { type: "physical", n: "01", title: "Current address", required: true },
  { type: "postal", n: "02", title: "Postal address", required: false },
  { type: "billing", n: "03", title: "Billing address", required: false },
] as const

export function StepAddress({ form, set, errors }: Readonly<{ form: PartyFormState; set: SetFn; errors: PartyErrors }>) {
  type Addr = NonNullable<PartyFormState["addresses"]>[number]
  const addresses: Addr[] = form.addresses ?? []
  function addrOf(type: Addr["type"]): Addr { return addresses.find((a) => a.type === type) ?? ({ type } as Addr) }
  function setAddr(type: Addr["type"], patch: Partial<Addr>) {
    const has = addresses.some((a) => a.type === type)
    set("addresses", has ? addresses.map((a) => (a.type === type ? { ...a, ...patch } : a)) : [...addresses, { type, ...patch } as Addr])
  }
  const hasData = (type: string) => addresses.some((a) => a.type === type && !!(a.streetNumber || a.streetName || a.line1 || a.suburb || a.city || a.postal))
  // Desktop shows all three sections; mobile shows only Current, revealing Postal/Billing on demand (kind to a
  // small screen). Optional sections that already carry data (resume) start open so nothing is hidden.
  const [openOptional, setOpenOptional] = useState<Set<string>>(() => new Set(ADDRESS_SECTIONS.filter((s) => !s.required && hasData(s.type)).map((s) => s.type)))
  const closedOptional = ADDRESS_SECTIONS.filter((s) => !s.required && !openOptional.has(s.type))
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">Where you live now, plus a postal or billing address if they differ. Current address is required — the rest are optional.</p>
      {ADDRESS_SECTIONS.map((s) => {
        const shown = s.required || openOptional.has(s.type)
        return (
          <section key={s.type} className={shown ? "" : "hidden lg:block"}>
            <SectLabel n={s.n}>{s.title}{!s.required && <span className="font-normal normal-case text-[var(--ink-mute)]"> · optional</span>}</SectLabel>
            <AddressFields address={addrOf(s.type)} onUpdate={(p) => setAddr(s.type, p)} requiredLine={s.required} />
            {s.required && errors.addresses && <p className="mt-2 text-xs text-destructive">{errors.addresses}</p>}
          </section>
        )
      })}
      {/* Mobile only — reveal an optional section. On desktop all three are already shown, so this is hidden. */}
      {closedOptional.length > 0 && (
        <div className="flex flex-wrap gap-2 lg:hidden">
          {closedOptional.map((s) => (
            <button key={s.type} type="button" onClick={() => setOpenOptional((prev) => new Set(prev).add(s.type))}
              className="inline-flex w-fit items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
              <Plus className="size-4" /> Add {s.title.toLowerCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Finances — three sub-tabs: Employment · Income · Expenses ─────────────────────
// Compact "excel" cell inputs (Income) — theme tokens; the native period <select> popup is themed light on the
// public surface by the global .pleks-public select rule (app/globals.css). Flex-wrap so the row stacks on a
// 360px phone (label on its own line, amount + period below) rather than overflowing a rigid grid.
const CELL_BASE = "rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-mute)] focus:border-[var(--amber)] focus:outline-none"
const CELL = `${CELL_BASE} px-2.5`
const CELL_SELECT = `${CELL} appearance-none`
// The amount value WITHOUT the "R" — the R is pinned to the field's left, the number right-aligns. (en-ZA spaces.)
const fmtRands = (cents: number) => formatZAR(cents).replace(/^R\s*/u, "")

// Finances · Employment — the status branches into employer / business / minimal context. The income figure
// itself lives in the Income sub-tab; this section is the context that qualifies it (and routes the evidence ask).
const HINT_INFO = "rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-xs text-[var(--ink-soft)]"
const HINT_AMBER = "rounded-[var(--r-button)] border border-[var(--amber)] bg-[var(--amber-wash)] px-3 py-2 text-xs text-[var(--amber-ink)]"
export function StepEmployment({ emp, setEmp }: Readonly<{ emp: Emp; setEmp: (v: Emp) => void }>) {
  const set = (patch: Partial<Emp>) => setEmp({ ...emp, ...patch })
  const t = emp.employment_type
  const employed = EMPLOYED_TYPES.includes(t)
  const selfEmployed = SELF_EMPLOYED_TYPES.includes(t)
  const probation = employed && startedWithinProbation(emp.start_date)
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">Where your income comes from — the context that qualifies your income figure. Affordability is judged on this plus your income and expenses; none of it triggers a credit check at this stage.</p>
      <div className="flex flex-col gap-4">
        <FieldGrid>
          <SelectField label="Employment status" value={t} onChange={(v) => set({ employment_type: v })} required options={EMPLOYMENT_OPTIONS} />
        </FieldGrid>

        {employed && (
          <>
            <FieldGrid>
              <TextField label="Employer name" value={emp.employer} onChange={(v) => set({ employer: v })} placeholder="Company name" />
              <TextField label="Employment start date" type="date" value={emp.start_date} onChange={(v) => set({ start_date: v })} />
              {t === "contract" && <TextField label="Contract end date" type="date" value={emp.contract_end_date ?? ""} onChange={(v) => set({ contract_end_date: v })} />}
              <TextField label="Job title (optional)" value={emp.job_title ?? ""} onChange={(v) => set({ job_title: v })} placeholder="e.g. Accountant" />
            </FieldGrid>
            <FieldGrid>
              <TextField label="Employer contact name (optional)" value={emp.employer_contact_name ?? ""} onChange={(v) => set({ employer_contact_name: v })} placeholder="HR or manager" />
              <TextField label="Employer contact (optional)" value={emp.employer_contact_detail ?? ""} onChange={(v) => set({ employer_contact_detail: v })} placeholder="Phone or email" />
            </FieldGrid>
            {t === "contract" && !!emp.contract_end_date && (
              <p className={HINT_INFO}>A fixed-term contract that ends before the lease runs out is an income-continuity signal the agent weighs — it doesn&apos;t decline you on its own.</p>
            )}
            {probation && (
              <p className={HINT_AMBER}>Started under {PROBATION_MONTHS} months ago — possibly still in a probation period. The agent sees this as context; it doesn&apos;t affect your score on its own.</p>
            )}
          </>
        )}

        {selfEmployed && (
          <>
            <FieldGrid>
              <TextField label="Business name" value={emp.business_name ?? ""} onChange={(v) => set({ business_name: v })} placeholder="Trading name" />
              <TextField label="Nature of business" value={emp.business_nature ?? ""} onChange={(v) => set({ business_nature: v })} placeholder="e.g. Consulting" />
              <TextField label="Trading since" type="date" value={emp.trading_since ?? ""} onChange={(v) => set({ trading_since: v })} />
            </FieldGrid>
            <FieldGrid>
              <SelectField label="Registered?" value={emp.registered ?? ""} onChange={(v) => set({ registered: v })} options={REGISTERED_OPTIONS} />
              <SelectField label="SARS-registered?" value={emp.sars_registered ?? ""} onChange={(v) => set({ sars_registered: v })} options={YESNO_OPTIONS} />
            </FieldGrid>
            <p className={HINT_INFO}>At the deep scan we&apos;ll ask for 6 months&apos; business and personal bank statements, plus your SARS Tax Compliance Status or ITA34 if registered.</p>
          </>
        )}

        {t === "retired" && <p className={HINT_INFO}>Add your pension or annuity as an income source in the next tab — that&apos;s all we need here.</p>}
        {t === "grant" && <p className={HINT_INFO}>Add your grant (e.g. the SASSA grant type) as an income source in the next tab — that&apos;s all we need here.</p>}
        {t === "unemployed" && <p className={HINT_INFO}>That&apos;s fine to declare. List any other income in the next tab, or apply with a co-applicant or guarantor whose income carries the application.</p>}
      </div>
    </div>
  )
}

// A reusable itemised line-item grid (income sources AND expense commitments use the SAME form): a header row,
// removable rows (label · R-amount · period), an empty-state, and a grouped "+ Add" picker. Speculative rows are
// desktop-only-until-used. Grows from a seed + picker — never a wall of empty rows (kind to a budget Android).
const PICKER_CHIP = "rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1 text-xs text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--rule)] disabled:hover:text-[var(--ink-soft)]"
function LineItemGrid({ rows, setRows, catalog, headerLabel, addLabel, emptyLabel }: Readonly<{
  rows: IncomeRow[]; setRows: (v: IncomeRow[]) => void
  catalog: { group: string; sources: { key: string; label: string }[] }[]
  headerLabel: string; addLabel: string; emptyLabel: string
}>) {
  const [pickerOpen, setPickerOpen] = useState(false)
  function removeRow(i: number) { setRows(rows.filter((_, idx) => idx !== i)) }
  function updateRow(i: number, patch: Partial<IncomeRow>) { setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r)) }
  function addSource(s: { key: string; label: string }) {
    // Keep the picker OPEN — most families add several at once; chips disable as they're added, close via the toggle.
    if (s.key === "other") { setRows([...rows, { key: `other_${rows.length}`, label: "", amount: "", period: "month", custom: true }]); return }
    const idx = rows.findIndex((r) => r.key === s.key)
    if (idx >= 0) { // a hidden speculative row → reveal it rather than duplicate
      if (rows[idx].speculative) setRows(rows.map((r, j) => (j === idx ? { ...r, speculative: false } : r)))
      return
    }
    setRows([...rows, { key: s.key, label: s.label, amount: "", period: "month" }])
  }
  return (
    <div>
      {/* One header row — the label is the first-column header, in line with Amount + Period (which show on sm+). */}
      <div className="flex items-center gap-2 px-0.5 pb-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--ink-mute)]">
        <span className="min-w-[140px] flex-1">{headerLabel}</span>
        <span className="hidden w-[120px] sm:block">Amount</span>
        <span className="hidden w-[110px] sm:block">Period</span>
        <span className="hidden size-7 shrink-0 sm:block" aria-hidden="true" />
      </div>
      {rows.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <div key={`${r.key}-${i}`} className={`${r.speculative && moneyCents(r.amount) === 0 ? "hidden lg:flex" : "flex"} flex-wrap items-center gap-2`}>
              {r.custom
                ? <input className={`${CELL} min-w-[140px] flex-1`} value={r.label} placeholder="Name" maxLength={60} onChange={(e) => updateRow(i, { label: e.target.value })} />
                : <span className="min-w-[140px] flex-1 text-sm text-[var(--ink)]">{r.label}</span>}
              <div className="relative w-[120px]">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-[var(--ink-mute)]">R</span>
                <input className={`${CELL_BASE} w-full pl-6 pr-2.5 text-right`} inputMode="numeric" value={r.amount} placeholder="0"
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                  onFocus={() => { const c = moneyCents(r.amount); updateRow(i, { amount: c > 0 ? String(c / 100) : "" }) }}
                  onBlur={() => { const c = moneyCents(r.amount); if (c > 0) updateRow(i, { amount: fmtRands(c) }) }} />
              </div>
              <select className={`${CELL_SELECT} w-[110px]`} value={r.period} onChange={(e) => updateRow(i, { period: e.target.value as IncomePeriod })}>
                {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <button type="button" onClick={() => removeRow(i)} aria-label="Remove" className="flex size-7 shrink-0 items-center justify-center text-[var(--ink-mute)] hover:text-red-600"><X className="size-4" /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-3 text-xs text-[var(--ink-mute)]">{emptyLabel}</p>
      )}
      {/* Grouped "+ Add" picker — most applicants have a handful, so the grid grows only as needed. */}
      <div className="mt-2">
        <button type="button" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen} className="inline-flex w-fit items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
          {pickerOpen ? <><CheckCircle2 className="size-4" /> Done</> : <><Plus className="size-4" /> {addLabel}</>}
        </button>
        {pickerOpen && (
          <div className="mt-2 flex flex-col gap-3 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
            {catalog.map((g) => (
              <div key={g.group}>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{g.group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.sources.map((s) => {
                    // A hidden speculative-empty row doesn't count as "added" — the chip still reveals it.
                    const added = s.key !== "other" && rows.some((r) => r.key === s.key && !(r.speculative && moneyCents(r.amount) === 0))
                    return <button key={s.key} type="button" disabled={added} onClick={() => addSource(s)} className={PICKER_CHIP}>{s.label}</button>
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// A "R left · number right" summary line (matches the grid's Amount column). The amount is always bold; `strong`
// also bolds the label + "monthly" (totals), while a soft label + muted R reads as a derived figure (residual).
function TotalLine({ label, cents, strong = true }: Readonly<{ label: string; cents: number; strong?: boolean }>) {
  const sideCls = strong ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-soft)]"
  return (
    <div className="flex items-center gap-2">
      <span className={`min-w-[140px] flex-1 ${sideCls}`}>{label}</span>
      <span className="flex w-[120px] items-center px-2.5 font-semibold text-[var(--ink)]"><span className={strong ? "" : "font-normal text-[var(--ink-mute)]"}>R</span><span className="flex-1 text-right">{fmtRands(cents)}</span></span>
      <span className={`w-[110px] ${sideCls}`}>monthly</span>
      <span className="size-7 shrink-0" aria-hidden="true" />
    </div>
  )
}

// Finances · Income — itemised sources via the shared grid + the affordability total (child maintenance excluded).
export function StepIncome({ income, setIncome, variable }: Readonly<{
  income: IncomeRow[]; setIncome: (v: IncomeRow[]) => void; variable: boolean
}>) {
  const childMaintCents = income.filter((r) => r.key === "maintenance").reduce((s, r) => s + rowMonthlyCents(r), 0)
  const affordabilityTotal = totalMonthlyCents(income) - childMaintCents
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">Every regular source of income. Pick the period for each amount — we convert everything to a monthly figure for the affordability check.</p>
      <div className="flex flex-col gap-4">
        {variable && (
          <p className={HINT_INFO}>Commission or variable income? Enter a typical month — we confirm the average from your bank statements.</p>
        )}
        <LineItemGrid rows={income} setRows={setIncome} catalog={INCOME_CATALOG} headerLabel="Sources of income" addLabel="Add another income source" emptyLabel="No income added yet — add each source you earn from below." />
        {income.length > 0 && (
          <div className="border-t border-[var(--rule)] pt-3 text-sm">
            <TotalLine label="Total monthly income (for affordability)" cents={affordabilityTotal} />
            {childMaintCents > 0 && (
              <p className="mt-1.5 text-[11px] text-[var(--ink-mute)]">Plus {formatZAR(childMaintCents)}/mo child maintenance — treated as covering the child&apos;s costs, not counted as rent-payable income.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Finances · Expenses — TWO clean groupings: (1) Dependents (adult + minor counts → living floor);
// (2) Monthly commitments (the itemised debt/contractual grid that competes with rent — school fees live here as
// a line, but the engine routes them to the child bucket). General living is NOT asked — it's in the living floor.
// The "left after" residual is deliberately NOT shown here — that's surfaced in Application review.
export function StepExpenses({ dependentAdults, setDependentAdults, dependentMinors, setDependentMinors, commitments, setCommitments }: Readonly<{
  dependentAdults: string; setDependentAdults: (v: string) => void
  dependentMinors: string; setDependentMinors: (v: string) => void
  commitments: IncomeRow[]; setCommitments: (v: IncomeRow[]) => void
}>) {
  const commitTotal = totalMonthlyCents(commitments)
  return (
    <div className="flex flex-col gap-9">
      <p className="text-sm text-[var(--ink-soft)]">Your committed monthly obligations and the people you support. We ask for real commitments — debit orders, debt, policies — not a full household budget; everyday living costs are already allowed for in the affordability read.</p>

      <section>
        <SectLabel n="01">Dependents</SectLabel>
        <FieldGrid>
          <TextField label="Adult dependants" type="number" value={dependentAdults} onChange={setDependentAdults} placeholder="0" />
          <TextField label="Minor dependants (children)" type="number" value={dependentMinors} onChange={setDependentMinors} placeholder="0" />
        </FieldGrid>
        <p className="mt-3 text-[11px] text-[var(--ink-mute)]">Dependants are people who rely on your income — an adult costs more than a child. Add school fees and child maintenance paid as commitments below; any child maintenance you receive is set against them, not counted as income.</p>
      </section>

      <section>
        <SectLabel n="02">Monthly commitments</SectLabel>
        <LineItemGrid rows={commitments} setRows={setCommitments} catalog={COMMITMENT_CATALOG} headerLabel="Monthly commitments" addLabel="Add a commitment" emptyLabel="No commitments added yet — add each monthly debit order or repayment below." />
        {commitments.length > 0 && (
          <div className="mt-4 border-t border-[var(--rule)] pt-3 text-sm">
            <TotalLine label="Total monthly commitments" cents={commitTotal} />
          </div>
        )}
      </section>
    </div>
  )
}

// ── Step 4 — Documents (income-driven categories, multi-file) ────────────────────
function docFileIcon(f: DocFile) {
  if (f.uploading) return <Loader2 className="size-4 animate-spin text-[var(--amber-ink)]" />
  if (f.error) return <AlertCircle className="size-4 text-red-600" />
  if (f.uploaded) return <CheckCircle2 className="size-4 text-emerald-600" />
  return <FileText className="size-4 text-[var(--ink-mute)]" />
}

function DocCategoryCard({ cat, files, skipped, onUpload, onRemove, onRename, onEscape }: Readonly<{
  cat: DocCategory; files: DocFile[]; skipped: boolean
  onUpload: (key: string, f: File | null, single: boolean) => void; onRemove: (key: string, id: string) => void
  onRename: (key: string, id: string, name: string) => void; onEscape: (key: string, v: boolean) => void
}>) {
  const showAdd = !(cat.single && files.some((f) => f.uploaded))
  const uploadCta = (
    <label className="inline-flex w-fit shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] px-3 py-1.5 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--amber)] hover:text-[var(--ink)]">
      {files.length > 0 ? <Plus className="size-4" /> : <Upload className="size-4" />}
      {files.length > 0 ? "Add another" : "Upload"}
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => { onUpload(cat.key, e.target.files?.[0] ?? null, cat.single); e.currentTarget.value = "" }} />
    </label>
  )
  return (
    <div className="rounded-[var(--r-button)] border border-[var(--rule)] p-3">
      {/* label + hint on the left, Upload CTA on the right — keeps each empty category to one compact row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-sm font-medium text-[var(--ink)]">{cat.label}{cat.required && <span className="text-[var(--amber-ink)]"> *</span>}</span>
          <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">{cat.hint}</span>
          {cat.escapeLabel && (
            <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-2 text-xs text-[var(--ink-soft)]">
              <input type="checkbox" checked={skipped} onChange={(e) => onEscape(cat.key, e.target.checked)} className="size-3.5 accent-[var(--amber)]" />
              {cat.escapeLabel}
            </label>
          )}
        </div>
        {showAdd && uploadCta}
      </div>
      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1">
              <span className="shrink-0">{docFileIcon(f)}</span>
              {cat.named
                ? <input value={f.name} onChange={(e) => onRename(cat.key, f.id, e.target.value)} placeholder="Name this document" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--ink)] focus:outline-none" />
                : <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">{f.name}</span>}
              {f.detection && <span className="text-xs text-emerald-600">{f.detection}</span>}
              {!f.uploading && <button type="button" onClick={() => onRemove(cat.key, f.id)} aria-label="Remove document" className="text-[var(--ink-mute)] hover:text-red-600"><X className="size-4" /></button>}
              {f.error && <span className="w-full whitespace-pre-line text-xs text-red-600">{f.error}</span>}
            </div>
          ))}
        </div>
      )}
      {cat.escapeNote && skipped && (
        <p className="mt-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2 text-xs text-[var(--ink-soft)]">{cat.escapeNote}</p>
      )}
    </div>
  )
}

export function StepDocuments({ tab, categories, docFiles, escape, onUpload, onRemove, onRename, onEscape }: Readonly<{
  tab: "required" | "optional"
  categories: DocCategory[]; docFiles: Record<string, DocFile[]>; escape: Record<string, boolean>
  onUpload: (key: string, f: File | null, single: boolean) => void; onRemove: (key: string, id: string) => void
  onRename: (key: string, id: string, name: string) => void; onEscape: (key: string, v: boolean) => void
}>) {
  const render = (cat: DocCategory) => (
    <DocCategoryCard key={cat.key} cat={cat} files={docFiles[cat.key] ?? []} skipped={!!escape[cat.key]} onUpload={onUpload} onRemove={onRemove} onRename={onRename} onEscape={onEscape} />
  )
  if (tab === "optional") {
    const optional = categories.filter((c) => c.tier === "optional")
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--ink-soft)]">None of these are required — but each one strengthens your application. Add whatever you have; skip the rest.</p>
        <div className="flex flex-col gap-3">{optional.map(render)}</div>
      </div>
    )
  }
  // Required tab — the core (gating) docs + any declaration-driven slots, each shown with why it's needed.
  const required = categories.filter((c) => c.tier === "required")
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--ink-soft)]">We ask only for what matches what you told us — these are the documents your application needs to be verified.</p>
      <div className="flex flex-col gap-3">{required.map(render)}</div>
      <p className="mt-1 rounded-[var(--r-button)] border border-dashed border-[var(--rule)] bg-[var(--paper-sunk)] px-3 py-2.5 text-xs text-[var(--ink-soft)]">There&apos;s an <span className="font-medium text-[var(--ink)]">Optional documents</span> tab next — references, proof of address, proof of savings and more that can strengthen your application (never required).</p>
    </div>
  )
}

