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
import { type ApplicantType, type CoApplicant, blankCo } from "./applyDomain"
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

// Numbered section divider for the landing's sub-sections (Returning · How are you applying). Landing-only.
function SectionEyebrow({ n, label }: Readonly<{ n: string; label: string }>) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--ink-mute)]">{n} · {label}</span>
      <span aria-hidden className="h-px flex-1 bg-[var(--rule)]" />
    </div>
  )
}

export function ApplyAsPane({ commercial, type, onSelect, coApplicants, setCoApplicants, company, setCompany, imDirector, setImDirector, loggedInEmail, onResend, onLogin, onBegin, resuming, busy }: Readonly<{
  commercial: boolean; type: ApplicantType | null; onSelect: (t: ApplicantType) => void
  coApplicants: CoApplicant[]; setCoApplicants: (v: CoApplicant[]) => void
  company: CompanyInfo; setCompany: (v: CompanyInfo) => void
  imDirector: boolean; setImDirector: (v: boolean) => void
  loggedInEmail: string | null; onResend: (email: string) => void; onLogin: () => void
  onBegin: () => void; resuming: boolean; busy?: boolean
}>) {
  const [retEmail, setRetEmail] = useState("")
  // couple / guarantor / company all capture people inline; company also captures the business above them.
  const parties = type === "couple" || type === "guarantor" || type === "company"
  const updateCo = (i: number, patch: Partial<CoApplicant>) => setCoApplicants(coApplicants.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const addCo = () => setCoApplicants([...coApplicants, blankCo(type === "guarantor" ? "guarantor" : "co_applicant")])
  const removeCo = (i: number) => setCoApplicants(coApplicants.filter((_, j) => j !== i))
  // Company person role depends on the type: juristic = director, partnership = partner, sole prop/other = owner.
  const companyJuristic = isJuristicCompanyType(company.companyType)
  let companyRole = "owner"
  if (companyJuristic) companyRole = "director"
  else if (company.companyType === "partnership") companyRole = "partner"
  // A sole proprietor (or "other") is ONE person — no "add another"; partnerships + juristic cos can have several.
  const companySinglePerson = type === "company" && !companyJuristic && company.companyType !== "partnership"
  let firstPartyLabel = commercial ? "a partner" : "a co-applicant"
  if (type === "guarantor") firstPartyLabel = commercial ? "a surety" : "a guarantor"
  else if (type === "company") firstPartyLabel = `a ${companyRole}`
  const addLabel = coApplicants.length > 0 ? "another" : firstPartyLabel
  let partyNote = "Each person gets their own secure link to consent & load documents."
  if (type === "company") partyNote = imDirector ? "You'll continue to your own details next." : `We'll email the ${companyRole} a secure link to complete the application.`

  return (
    <div className="flex min-h-full flex-col gap-6">
      {/* No large heading — the panel header bar above carries "Apply to · {unit}"; keep just the explanation. */}
      <p className="text-sm leading-relaxed text-[var(--ink-soft)]">A short pre-selection so the agent can shortlist applicants. It&apos;s free, there&apos;s no credit check at this stage, and you can save and finish whenever suits you.</p>

      {/* 01 · Returning */}
      <section className="flex flex-col gap-3">
        <SectionEyebrow n="01" label="Returning?" />
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
        <SectionEyebrow n="02" label="How are you applying?" />
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

        {/* Inline capture — one grey block. Couple → co-applicants · guarantor → guarantors · company → the
            business (type + reg) PLUS the director(s) signing on its behalf. Compact rows so it doesn't scroll. */}
        {parties && (
          <div className="flex flex-col gap-2 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-3">
            {type === "company" && (
              <div className="flex flex-col gap-1">
                {/* The company TYPE is what we need up front — it determines the whole company flow (sole prop =
                    a personal application with a trading name; (Pty)/CC = CIPC reg + AFS; etc.). Reg number, AFS
                    and the rest are captured later, conditional on the type. */}
                <select value={company.companyType} onChange={(e) => setCompany({ ...company, companyType: e.target.value })}
                  className="w-full rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-[var(--amber)] focus:outline-none">
                  {COMPANY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value === "" ? "Company type…" : o.label}</option>)}
                </select>
              </div>
            )}
            {type === "company" && company.companyType && (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-[var(--ink)]">{companySinglePerson ? "Who's the owner?" : "Who's applying on the company's behalf?"}</p>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--ink-soft)]">
                  <input type="checkbox" checked={imDirector} onChange={(e) => setImDirector(e.target.checked)} className="size-3.5 accent-[var(--amber)]" />
                  It&apos;s me — I&apos;m the {companyRole}
                </label>
              </div>
            )}
            {/* The person input(s) drop down once a company type is chosen (for couple/guarantor they show straight away). */}
            {(type !== "company" || company.companyType) && coApplicants.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <input placeholder="First name" value={c.firstName} onChange={(e) => updateCo(i, { firstName: e.target.value })} className={CO_INPUT} />
                <input placeholder="Last name" value={c.lastName} onChange={(e) => updateCo(i, { lastName: e.target.value })} className={CO_INPUT} />
                <input type="email" placeholder="Email" autoComplete="off" value={c.email} onChange={(e) => updateCo(i, { email: e.target.value })} className={CO_INPUT} />
                <input placeholder="ID number" value={c.idNumber} onChange={(e) => updateCo(i, { idNumber: e.target.value })} className={CO_INPUT} />
                {coApplicants.length > 1 && <button type="button" onClick={() => removeCo(i)} aria-label="Remove this person" className="shrink-0 text-[var(--ink-mute)] transition-colors hover:text-red-600"><X className="size-4" /></button>}
              </div>
            ))}
            {(type !== "company" || company.companyType) && (
              <div className="flex items-center justify-between gap-2">
                {/* A sole proprietor is one person — no "add another"; partnerships + juristic cos can add more. */}
                {!companySinglePerson ? (
                  <button type="button" onClick={addCo}
                    className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
                    <Plus className="size-4" /> Add {addLabel}
                  </button>
                ) : <span />}
                <span className="text-[11px] text-[var(--ink-mute)]">{partyNote}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Begin — bottom-right, same primary action style as Submit. */}
      <div className="mt-auto flex justify-end pt-3">
        <ActionButton tone="primary" disabled={busy || !type} onClick={onBegin}>
          <span className="inline-flex items-center gap-1.5">{resuming ? "Continue" : "Begin your application"} <ArrowRight className="size-4" /></span>
        </ActionButton>
      </div>
    </div>
  )
}
