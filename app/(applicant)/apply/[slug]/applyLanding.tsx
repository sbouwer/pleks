"use client"

/**
 * app/(applicant)/apply/[slug]/applyLanding.tsx — the "Apply as" landing (orchestrator's entry surface)
 *
 * Notes:  The pre-flow landing: returning-applicant resume, how-it-works, and the application-type cards +
 *         inline party capture. The orchestrator (StepPanel) renders this before any flow, then routes to the
 *         chosen flow. Shares only bricks + applyDomain.
 */
import { useState } from "react"
import { ArrowRight, Building2, CheckCircle2, HandCoins, LogIn, Plus, User, Users, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import type { PartyFormState } from "@/lib/parties/partyValidation"
import { PARTY_ID_TYPES } from "@/lib/parties/partyConfig"
import { SectLabel } from "@/components/parties/partyFields"
import { type ApplicantType, type CoApplicant, type CoRole, type SetFn, blankCo } from "./applyDomain"
import { type CompanyInfo, COMPANY_TYPE_OPTIONS, isJuristicCompanyType } from "./applyCompany"

/** Card copy adapts to the lease type — "I'll live here" makes no sense on a commercial lease. */
function typesFor(commercial: boolean): ReadonlyArray<{ id: ApplicantType; icon: LucideIcon; title: string; blurb: string }> {
  return [
    { id: "individual", icon: User, title: commercial ? "Sole proprietor" : "Just me", blurb: commercial ? "I'm leasing in my own name (sole proprietor)." : "I'll be the only person on the lease." },
    { id: "couple", icon: Users, title: commercial ? "Partners / multiple" : "Couple / multiple", blurb: commercial ? "Two or more partners on the lease together — each gets their own secure link." : "Two or more of us will be on the lease together — each gets their own secure link." },
    { id: "guarantor", icon: HandCoins, title: "On behalf / guarantor", blurb: commercial ? "A surety backs the application but won't be on the lease." : "Someone backs the application financially but won't live here — e.g. a parent for an adult child." },
    { id: "company", icon: Building2, title: "Company", blurb: "A registered business is leasing, with a director signing surety." },
  ]
}

// Compact bare input for the inline co-applicant rows on the landing (placeholders instead of labels → one line).
const CO_INPUT = "min-w-[110px] flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none"
// The 5th "Designation" column — a role-title dropdown. Solid border to match the rest of the row (First/Last/Email/
// Identity + the "You" cell) so every row reads as one consistent format.
const CO_DESIGNATION = "min-w-[110px] flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none"
// Same select, but min-w-0 so it can shrink WITHIN its column cell — used when a delete ✗ shares the cell, so
// ONLY this last box gives up room for the ✗ (the other four columns keep the full-width sizing).
const CO_DESIGNATION_INNER = "min-w-0 flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none"
// The delete column lives INSIDE the last cell so only that box shrinks; the ✗ button styling.
const CO_DELETE_BTN = "shrink-0 text-[var(--ink-mute)] transition-colors hover:text-red-600"

// Short chip labels for the chosen type (PARTY_ID_TYPES carries the canonical values + long labels — same SSOT the
// personal step's IdField uses, so a type picked here matches there).
const ID_CHIP_LABEL: Record<string, string> = { sa_id: "SA ID", passport: "Passport", asylum_permit: "Permit" }

/** Single-column identity control — an "Identity" dropdown that MORPHS into the chosen type's number input, so a
 *  foreign applicant picks Passport / Permit instead of being silently recorded under an SA ID. The leading type
 *  chip switches back to the dropdown (clearing the number, since formats differ). Same footprint as the sibling
 *  inputs so the row's five columns stay aligned. The morph also enforces "pick a type before you can type a number". */
function IdentityField({ idType, idNumber, onType, onNumber }: Readonly<{
  idType: string | undefined; idNumber: string; onType: (t: string) => void; onNumber: (v: string) => void
}>) {
  // ONE outer box for BOTH states (same flex sizing as the sibling inputs) so the column width never changes when it
  // morphs: a native <select> is sized to its widest option, so without a shared wrapper the dropdown would be wider
  // than the number input. The inner select/input are borderless + min-w-0 so the wrapper alone owns the width.
  const wrap = "flex min-w-[110px] flex-1 items-center overflow-hidden rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] focus-within:border-[var(--amber)]"
  if (!idType) return (
    <span className={wrap}>
      <select aria-label="Identity document type" value="" onChange={(e) => onType(e.target.value)}
        className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-[var(--ink-soft)] focus:outline-none">
        <option value="" disabled>Identity…</option>
        {PARTY_ID_TYPES.map((t) => <option key={t.value} value={t.value}>{ID_CHIP_LABEL[t.value] ?? t.label}</option>)}
      </select>
    </span>
  )
  const chip = ID_CHIP_LABEL[idType] ?? "ID"
  return (
    <span className={wrap}>
      <button type="button" onClick={() => { onNumber(""); onType("") }} title="Change identity type"
        className="shrink-0 self-stretch border-r border-[var(--rule)] bg-[var(--paper-sunk)] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
        {chip}
      </button>
      <input aria-label={`${chip} number`} placeholder="Number" value={idNumber} onChange={(e) => onNumber(e.target.value)}
        className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-[var(--ink)] focus:outline-none" />
    </span>
  )
}

/** Couple / guarantor inline party capture — 5-column rows (First · Last · Email · ID · Designation). Row 1 is YOU
 *  (the filler / primary applicant, bound to `form`; you finish your full details next). The other rows are the
 *  co-applicants / guarantors, whose Designation column sets the role — a co-applicant's income counts toward
 *  affordability, a guarantor backstops it. Add appends a blank row (designation = the role). */
function PersonParties({ type, form, set, coApplicants, setCoApplicants }: Readonly<{
  type: ApplicantType; form: PartyFormState; set: SetFn; coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
}>) {
  const updateCo = (i: number, patch: Partial<CoApplicant>) => setCoApplicants(coApplicants.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const addCo = () => setCoApplicants([...coApplicants, blankCo(type === "guarantor" ? "guarantor" : "co_applicant")])
  const removeCo = (i: number) => setCoApplicants(coApplicants.filter((_, j) => j !== i))
  // First two parties are mandatory (You + the first co) — only couple/guarantor reach here; "just me" shows no party
  // section at all. Co-applicants at/after this index are optional → removable (✗) + last box tucked.
  const mandatoryCo = 1
  return (
    <>
      <p className="text-xs font-medium text-[var(--ink)]">Who&apos;s on the application?</p>
      {/* Row 1 — YOU. The primary applicant; you'll finish your full details next. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <input placeholder="First name" value={form.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} className={CO_INPUT} />
        <input placeholder="Last name" value={form.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} className={CO_INPUT} />
        <input type="email" placeholder="Email" autoComplete="off" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} className={CO_INPUT} />
        <IdentityField idType={form.idType} idNumber={form.idNumber ?? ""} onType={(t) => set("idType", t)} onNumber={(v) => set("idNumber", v)} />
        {/* Structurally identical to the co-rows' last cell — an outer flex-1 wrapper with a min-w-0 inner box — so
            this column sizes EXACTLY like the dropdown cells and row 1's columns line up with the rows below. */}
        <span className="flex min-w-[110px] flex-1 items-center">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] px-2 py-1.5 text-xs text-[var(--ink-soft)]">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="min-w-0 truncate">You · Applicant</span>
          </span>
        </span>
        {/* No trailing gutter — YOU are mandatory + can't be removed, so the last box runs full width to the edge. */}
      </div>
      {/* The other people — the Designation column sets each one's role. */}
      {coApplicants.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <input placeholder="First name" value={c.firstName} onChange={(e) => updateCo(i, { firstName: e.target.value })} className={CO_INPUT} />
          <input placeholder="Last name" value={c.lastName} onChange={(e) => updateCo(i, { lastName: e.target.value })} className={CO_INPUT} />
          <input type="email" placeholder="Email" autoComplete="off" value={c.email} onChange={(e) => updateCo(i, { email: e.target.value })} className={CO_INPUT} />
          <IdentityField idType={c.idType} idNumber={c.idNumber} onType={(t) => updateCo(i, { idType: t })} onNumber={(v) => updateCo(i, { idNumber: v })} />
          {/* Last column. Mandatory parties (i < mandatoryCo) run full width, no ✗. Optional applicants are
              removable: the ✗ tucks INTO this cell so only this box shrinks. */}
          <span className="flex min-w-[110px] flex-1 items-center gap-1">
            <select value={c.role} onChange={(e) => updateCo(i, { role: e.target.value as CoRole })} className={CO_DESIGNATION_INNER} aria-label="Designation">
              <option value="co_applicant">Co-applicant</option>
              <option value="guarantor">Guarantor</option>
            </select>
            {i >= mandatoryCo && <button type="button" onClick={() => removeCo(i)} aria-label="Remove this person" className={CO_DELETE_BTN}><X className="size-4" /></button>}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={addCo} className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
          <Plus className="size-4" /> Add another person
        </button>
        <span className="text-[11px] text-[var(--ink-mute)]">Each person gets their own secure link to consent &amp; load documents.</span>
      </div>
    </>
  )
}

/** Company inline party capture — same 5-column rhythm as PersonParties. Row 1 is YOU (the filler), bound to `form`,
 *  with a Designation dropdown that IS the filler choice: "the {director/owner}" (you're on the application →
 *  imDirector) or "On behalf" (an office manager not on the application → the director is emailed). The other rows
 *  are co-directors / signatories whose Designation is a free title. The company TYPE select sits above the people
 *  (it drives the whole company flow). */
function CompanyParties({ company, setCompany, form, set, coApplicants, setCoApplicants, imDirector, setImDirector, companyRole, singlePerson }: Readonly<{
  company: CompanyInfo; setCompany: (v: CompanyInfo) => void; form: PartyFormState; set: SetFn
  coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
  imDirector: boolean; setImDirector: (v: boolean) => void; companyRole: string; singlePerson: boolean
}>) {
  const updateCo = (i: number, patch: Partial<CoApplicant>) => setCoApplicants(coApplicants.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const addCo = () => setCoApplicants([...coApplicants, { ...blankCo("co_applicant"), designation: "director" }])
  const removeCo = (i: number) => setCoApplicants(coApplicants.filter((_, j) => j !== i))
  // First two parties are mandatory (You + the first director); extra directors are optional → removable (✗).
  const mandatoryCo = 1
  return (
    <>
      {/* The company TYPE drives the whole flow (sole prop = personal application + trading name; (Pty)/CC = CIPC +
          AFS; etc.). Reg number, AFS and the rest are captured later, conditional on the type. Full width — it aligns
          with the mandatory people rows below (only manually-added directors reserve a delete column). */}
      <div className="flex items-center gap-1.5">
        <select value={company.companyType} onChange={(e) => setCompany({ ...company, companyType: e.target.value })}
          className="min-w-0 flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none">
          {COMPANY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value === "" ? "Company type…" : o.label}</option>)}
        </select>
      </div>
      {company.companyType && (
        <>
          <p className="text-xs font-medium text-[var(--ink)]">{singlePerson ? "Who's the owner?" : "Who's on the company's behalf?"}</p>
          {/* Row 1 — YOU. The Designation IS the filler choice (the {companyRole} → on the application; On behalf → not). */}
          <div className="flex flex-wrap items-center gap-1.5">
            <input placeholder="First name" value={form.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} className={CO_INPUT} />
            <input placeholder="Last name" value={form.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} className={CO_INPUT} />
            <input type="email" placeholder="Email" autoComplete="off" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} className={CO_INPUT} />
            <IdentityField idType={form.idType} idNumber={form.idNumber ?? ""} onType={(t) => set("idType", t)} onNumber={(v) => set("idNumber", v)} />
            <select value={company.fillerDesignation ?? (singlePerson ? "owner" : "director")} aria-label="Your role" className={CO_DESIGNATION}
              onChange={(e) => {
                const val = e.target.value
                setCompany({ ...company, fillerDesignation: val })
                const party = val !== "on_behalf"
                setImDirector(party)
                // On behalf → you're not a party, so the named {companyRole} must be captured; drop one in for them.
                if (!party && coApplicants.length === 0) addCo()
              }}>
              {singlePerson
                ? <option value="owner">the owner</option>
                : <>
                    <option value="director">Director</option>
                    <option value="shareholder">Shareholder</option>
                    <option value="guarantor">Guarantor / surety</option>
                    <option value="other">Other</option>
                  </>}
              <option value="on_behalf">On behalf</option>
            </select>
          </div>
          {/* Co-directors / signatories — the Designation is a free title. */}
          {coApplicants.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input placeholder="First name" value={c.firstName} onChange={(e) => updateCo(i, { firstName: e.target.value })} className={CO_INPUT} />
              <input placeholder="Last name" value={c.lastName} onChange={(e) => updateCo(i, { lastName: e.target.value })} className={CO_INPUT} />
              <input type="email" placeholder="Email" autoComplete="off" value={c.email} onChange={(e) => updateCo(i, { email: e.target.value })} className={CO_INPUT} />
              <IdentityField idType={c.idType} idNumber={c.idNumber} onType={(t) => updateCo(i, { idType: t })} onNumber={(v) => updateCo(i, { idNumber: v })} />
              {/* Last column. Mandatory parties (i < mandatoryCo) run full width, no ✗; optional directors are
                  removable — the ✗ tucks INTO this cell so only this box shrinks. */}
              <span className="flex min-w-[110px] flex-1 items-center gap-1">
                {/* Guarantor/surety → the guarantor ROLE (income backstops the rent); everyone else is a co-party. */}
                <select value={c.designation ?? "director"} onChange={(e) => updateCo(i, { designation: e.target.value, role: e.target.value === "guarantor" ? "guarantor" : "co_applicant" })} className={CO_DESIGNATION_INNER} aria-label="Designation">
                  <option value="director">Director</option>
                  <option value="shareholder">Shareholder</option>
                  <option value="guarantor">Guarantor / surety</option>
                  <option value="other">Other</option>
                </select>
                {i >= mandatoryCo && <button type="button" onClick={() => removeCo(i)} aria-label="Remove this person" className={CO_DELETE_BTN}><X className="size-4" /></button>}
              </span>
            </div>
          ))}
          {/* A sole proprietor is one person — no "add another" — UNLESS you're filling on behalf, where the named
              owner must be captured (they're emailed, not you). Partnerships + juristic cos can always add more. */}
          {(!singlePerson || !imDirector) && (
            <button type="button" onClick={addCo} className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
              <Plus className="size-4" /> {singlePerson ? `Add the ${companyRole}` : "Add another person"}
            </button>
          )}
          <span className="text-[11px] text-[var(--ink-mute)]">{imDirector ? "You'll continue to your own details next; anyone else gets their own secure link." : `We'll email the ${companyRole} a secure link to complete the application.`}</span>
        </>
      )}
    </>
  )
}

export function ApplyAsPane({ commercial, type, onSelect, form, set, coApplicants, setCoApplicants, company, setCompany, imDirector, setImDirector, loggedInEmail, onResend, onLogin, onBegin, resuming, busy }: Readonly<{
  commercial: boolean; type: ApplicantType | null; onSelect: (t: ApplicantType) => void
  form: PartyFormState; set: SetFn
  coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
  company: CompanyInfo; setCompany: (v: CompanyInfo) => void
  imDirector: boolean; setImDirector: (v: boolean) => void
  loggedInEmail: string | null; onResend: (email: string) => void; onLogin: () => void
  onBegin: () => void; resuming: boolean; busy?: boolean
}>) {
  const [retEmail, setRetEmail] = useState("")
  // couple / guarantor / company all capture people inline; company also captures the business above them.
  // The per-type capture lives in PersonParties / CompanyParties; this pane just picks one.
  const parties = type === "couple" || type === "guarantor" || type === "company"
  // Company person role depends on the type: juristic = director, partnership = partner, sole prop/other = owner.
  const companyJuristic = isJuristicCompanyType(company.companyType)
  let companyRole = "owner"
  if (companyJuristic) companyRole = "director"
  else if (company.companyType === "partnership") companyRole = "partner"
  // A sole proprietor (or "other") is ONE person — no "add another"; partnerships + juristic cos can have several.
  const companySinglePerson = type === "company" && !companyJuristic && company.companyType !== "partnership"

  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* No large heading — the panel header bar above carries "Apply to · {unit}"; keep just the explanation. */}
      <p className="text-sm leading-relaxed text-[var(--ink-soft)]">A short pre-selection so the agent can shortlist applicants. It&apos;s free, there&apos;s no credit check at this stage, and you can save and finish whenever suits you.</p>

      {/* 01 · Returning */}
      <section className="flex flex-col gap-3">
        <SectLabel n="01">Returning?</SectLabel>
        {loggedInEmail ? (
          <div className="flex items-center gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] px-4 py-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span className="text-[var(--ink-soft)]">Signed in as <span className="font-medium text-[var(--ink)]">{loggedInEmail}</span> — your details will pre-fill.</span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Continue a saved application */}
            <div className="flex flex-col gap-1.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4">
              <p className="text-sm font-medium text-[var(--ink)]">Continue a saved application</p>
              <p className="text-xs leading-relaxed text-[var(--ink-soft)]">Enter your email and we&apos;ll resend the link to pick up where you left off.</p>
              <div className="mt-auto flex gap-2 pt-2">
                <input type="email" value={retEmail} onChange={(e) => setRetEmail(e.target.value)} placeholder="you@email.com"
                  className="min-w-0 flex-1 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2.5 py-1.5 text-sm text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none" />
                <ActionButton tone="secondary" size="sm" onClick={() => onResend(retEmail)}>Resend</ActionButton>
              </div>
            </div>
            {/* Log in to pre-fill */}
            <div className="flex flex-col gap-1.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4">
              <p className="text-sm font-medium text-[var(--ink)]">Already a Pleks tenant?</p>
              <p className="text-xs leading-relaxed text-[var(--ink-soft)]">Log in and we&apos;ll pre-fill your details — no need to re-enter everything you&apos;ve told us before.</p>
              <div className="mt-auto pt-2"><ActionButton tone="secondary" size="sm" icon={<LogIn className="size-4" />} onClick={onLogin}>Log in to pre-fill</ActionButton></div>
            </div>
          </div>
        )}
      </section>

      {/* 02 · How are you applying */}
      <section className="flex flex-col gap-3">
        <SectLabel n="02">How are you applying?</SectLabel>
        <div className="grid gap-3 sm:grid-cols-2 [@media(min-width:1024px)_and_(min-height:700px)]:grid-cols-4">
          {typesFor(commercial).map((c) => {
            const selected = type === c.id
            return (
              <button key={c.id} type="button" onClick={() => onSelect(c.id)}
                className={`group flex flex-col items-start gap-2 rounded-[var(--r-button)] border bg-[var(--paper-raised)] p-3 text-left transition-colors ${selected ? "border-[var(--amber)] ring-1 ring-[var(--amber)]" : "border-[var(--rule)] hover:border-[var(--amber)]"}`}>
                <span className={`flex size-8 items-center justify-center rounded-[var(--r-button)] ${selected ? "bg-[var(--amber)] text-[var(--paper)]" : "bg-[var(--amber-wash)] text-[var(--amber-ink)]"}`}><c.icon className="size-[18px]" /></span>
                <span className="text-sm font-semibold leading-snug text-[var(--ink)]">{c.title}</span>
                <span className="text-[11px] leading-snug text-[var(--ink-soft)]">{c.blurb}</span>
              </button>
            )
          })}
        </div>

        {/* Inline capture — one grey block. Couple / guarantor → the people (5-column rows). Company → the business
            type + the people on its behalf. Both share the row rhythm (First · Last · Email · ID · Designation). */}
        {parties && type && (
          <div className="flex flex-col gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] px-4 py-3">
            {type === "company" ? (
              <CompanyParties company={company} setCompany={setCompany} form={form} set={set} coApplicants={coApplicants} setCoApplicants={setCoApplicants}
                imDirector={imDirector} setImDirector={setImDirector} companyRole={companyRole} singlePerson={companySinglePerson} />
            ) : (
              <PersonParties type={type} form={form} set={set} coApplicants={coApplicants} setCoApplicants={setCoApplicants} />
            )}
          </div>
        )}
      </section>

      {/* Begin — bottom-right, same primary action style as Submit. */}
      <div className="mt-auto flex justify-end pt-1">
        <ActionButton tone="primary" disabled={busy || !type} onClick={onBegin}>
          <span className="inline-flex items-center gap-1.5">{resuming ? "Continue" : "Begin your application"} <ArrowRight className="size-4" /></span>
        </ActionButton>
      </div>
    </div>
  )
}
