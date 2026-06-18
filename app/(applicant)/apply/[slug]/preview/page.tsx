"use client"

/**
 * app/(applicant)/apply/[slug]/preview/page.tsx — VISUAL-LAYOUT PREVIEW of the redesigned applicant
 * pre-screening page (design handoff: brief/design/project/design_handoff_application_page).
 *
 * Route:  /apply/[slug]/preview
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  Layout pass built to match the REAL login surface (see brief/design/DESIGN_LANGUAGE.md):
 *         .pleks-public warm theme + FocusBackdrop, the <Wordmark> brand mark, square door-style cards
 *         and the .fs-panel door panel with .fs-knob + .stoep tabs. Full-height responsive layout — left
 *         and right columns stretch to equal height; the unit card grows to fill the left column. Step 1
 *         (Personal details) uses the shared forms field grammar (= the add-tenant capture; applicant ≡
 *         tenant). Sample data; real-data wiring + remaining step bodies + the Stage-1 FitScore score step
 *         are later passes. Does NOT touch the live /apply flow.
 */

import { useState } from "react"
import { Wordmark } from "@/components/ui/Wordmark"
import { FocusBackdrop } from "@/components/layout/FocusBackdrop"
import "@/components/layout/focus-shell.css"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import { Bed, Bath, Maximize, MapPin, Phone, Mail, ShieldCheck, ImageIcon } from "lucide-react"

const STEPS = [
  { label: "Personal details", detail: "Residential lease" },
  { label: "Applicants", detail: "Not started" },
  { label: "Documents", detail: "Not started" },
  { label: "Score", detail: "Not started" },
]

function tabClass(done: boolean, cur: boolean): string {
  if (cur) return "stoep font-medium text-[var(--ink)]"
  if (done) return "text-[var(--ink)]"
  return "text-[var(--ink-mute)]"
}
function circleClass(done: boolean, cur: boolean): string {
  if (done) return "bg-[var(--ink)] text-[var(--paper)]"
  if (cur) return "border-[1.5px] border-[var(--amber)] text-[var(--amber-ink)]"
  return "border-[1.5px] border-[var(--rule-strong)] text-[var(--ink-mute)]"
}
function progressLabelClass(cur: boolean, faded: boolean): string {
  if (cur) return "font-medium text-[var(--ink)]"
  if (faded) return "text-[var(--ink-mute)]"
  return "text-[var(--ink)]"
}

/** Mono uppercase meta label — the app's eyebrow grammar. */
function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{children}</span>
}

/** Square door-style card (dashboard grammar: --r-button radius, --rule hairline, --paper-raised). */
function DoorCard({ children, className = "" }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return <div className={`rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-4 ${className}`}>{children}</div>
}

/** Unit card — grows to fill the left column; the listing photo expands into the extra space. */
function UnitCard() {
  return (
    <DoorCard className="flex flex-col gap-3 lg:flex-1">
      <div className="flex min-h-[120px] flex-1 items-center justify-center rounded-[var(--r-button)] bg-[var(--paper-sunk)] text-[var(--ink-faint)]">
        <ImageIcon className="size-7" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--ink)]">2 Bedroom Apartment</p>
        <p className="flex items-center gap-1 truncate text-xs text-[var(--ink-soft)]">
          <MapPin className="size-3 shrink-0" /> The Equinox · Sea Point
        </p>
      </div>
      <div className="flex items-end justify-between border-t border-[var(--rule)] pt-3">
        <div>
          <p className="text-base font-medium text-[var(--ink)]">R 14 500<span className="text-xs text-[var(--ink-mute)]"> /mo</span></p>
          <p className="text-[11px] text-[var(--ink-mute)]">Deposit R 14 500 · avail. 1 Aug</p>
        </div>
        <div className="flex items-center gap-2.5 text-[11px] text-[var(--ink-soft)]">
          <span className="flex items-center gap-1"><Bed className="size-3.5" />2</span>
          <span className="flex items-center gap-1"><Bath className="size-3.5" />1</span>
          <span className="flex items-center gap-1"><Maximize className="size-3" />68m²</span>
        </div>
      </div>
    </DoorCard>
  )
}

function AgentCard() {
  return (
    <DoorCard>
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--amber-wash)] text-sm font-semibold text-[var(--amber-ink)]">AP</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--ink)]">Annelise Pretorius</p>
          <p className="truncate text-xs text-[var(--ink-soft)]">Rox &amp; Co Property Management</p>
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--amber-ink)]">FFC 2025-0041</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--rule)] pt-3 text-[11px] text-[var(--ink-soft)]">
        <span className="flex items-center gap-1.5"><Phone className="size-3" /> 082 551 0934</span>
        <span className="flex items-center gap-1.5 truncate"><Mail className="size-3" /> annelise@roxco.co.za</span>
      </div>
    </DoorCard>
  )
}

function ProgressList({ step }: Readonly<{ step: number }>) {
  return (
    <DoorCard>
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>Your application</Eyebrow>
        <Eyebrow>saved · {step + 1}/4</Eyebrow>
      </div>
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => {
          const done = i < step
          const cur = i === step
          const faded = i > step
          return (
            <li key={s.label} className="flex items-center gap-2.5">
              <span className={`flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] ${circleClass(done, cur)}`}>
                {done ? "✓" : i + 1}
              </span>
              <span className={`text-[13px] ${progressLabelClass(cur, faded)}`}>{s.label}</span>
            </li>
          )
        })}
      </ol>
    </DoorCard>
  )
}

function TabBar({ step }: Readonly<{ step: number }>) {
  return (
    <div className="flex gap-5 border-b border-[var(--rule)]">
      {STEPS.map((s, i) => {
        const done = i < step
        const cur = i === step
        return (
          <span key={s.label} className={`flex items-center gap-2 pb-2.5 text-[13px] ${tabClass(done, cur)}`}>
            <span className={`flex size-[18px] items-center justify-center rounded-full text-[10px] ${circleClass(done, cur)}`}>{done ? "✓" : i + 1}</span>
            {s.label}
          </span>
        )
      })}
    </div>
  )
}

/** Residential ↔ Commercial segmented control (door grammar). */
function Segmented({ value, onChange }: Readonly<{ value: string; onChange: (v: string) => void }>) {
  return (
    <div className="inline-flex rounded-[var(--r-button)] border border-[var(--rule)] p-0.5">
      {["Residential", "Commercial"].map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`rounded-[var(--r-button)] px-4 py-1.5 text-sm transition-colors ${value === o ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

/** Step 1 — Personal details. Uses the shared forms field grammar (= the add-tenant capture). */
function StepPersonal() {
  const [f, setF] = useState<Record<string, string>>({ leaseType: "Residential" })
  const set = (k: string) => (v: string) => setF((p) => ({ ...p, [k]: v }))
  return (
    <div className="flex flex-1 flex-col gap-5 py-5">
      <div>
        <h2 className="text-xl font-medium tracking-[-0.01em] text-[var(--ink)]">Tell us about you</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">
          A few details to start your application — free, no credit check at this stage. We collect consent now so a lawful credit check can run later if you&apos;re shortlisted.
        </p>
      </div>

      <Segmented value={f.leaseType} onChange={set("leaseType")} />

      <FieldGrid>
        <TextField label="Full name" value={f.fullName} onChange={set("fullName")} span required placeholder="Nomvula Dlamini" />
        <TextField label="SA ID number" value={f.idNumber} onChange={set("idNumber")} required placeholder="8• ••••••• •• •" maxLength={13} />
        <TextField label="Mobile" type="tel" value={f.mobile} onChange={set("mobile")} required placeholder="082 000 0000" />
        <TextField label="Email" type="email" value={f.email} onChange={set("email")} span required placeholder="you@email.com" />
        <TextField label="Current address" value={f.address} onChange={set("address")} span placeholder="Street, suburb, city" />
        <SelectField
          label="Employment status"
          value={f.employment}
          onChange={set("employment")}
          options={[
            { value: "", label: "Select…" },
            { value: "employed", label: "Employed (full-time)" },
            { value: "self", label: "Self-employed" },
            { value: "contract", label: "Contract" },
            { value: "other", label: "Other" },
          ]}
        />
        <TextField label="Gross monthly income" value={f.income} onChange={set("income")} placeholder="R 0" />
        <TextField label="Employer" value={f.employer} onChange={set("employer")} placeholder="Company name" />
        <SelectField
          label="Adults moving in"
          value={f.adults}
          onChange={set("adults")}
          options={[
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4+" },
          ]}
        />
      </FieldGrid>

      <div className="mt-auto flex justify-end pt-2">
        <button type="button" className="fs-cta" style={{ maxWidth: 260 }}>
          <span className="fs-cta-bar" aria-hidden="true" />
          <span className="fs-cta-label">Continue to applicants</span>
          <span className="fs-cta-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}

export default function ApplyPreviewPage() {
  const step = 0
  return (
    <div className="pleks-public fixed inset-0 z-50 overflow-auto" data-theme="light" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      {/* Same 4-layer warm backdrop as the login surface (fixed behind content) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden"><FocusBackdrop /></div>

      <div className="relative z-10 flex min-h-full flex-col">
        {/* Header — backed surface, real Wordmark */}
        <header className="shrink-0 border-b border-[var(--rule)] bg-[var(--paper-raised)]">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-3">
              <Wordmark style={{ fontSize: 19 }} />
              <span className="h-4 w-px bg-[var(--rule)]" />
              <Eyebrow>Rental application</Eyebrow>
            </div>
            <span className="flex items-center gap-1.5 text-[var(--ink-mute)]">
              <ShieldCheck className="size-3.5" />
              <Eyebrow>Encrypted · Ref SP-304</Eyebrow>
            </span>
          </div>
        </header>

        {/* Content row — fills to viewport bottom; columns stretch to equal height */}
        <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col gap-6 px-6 py-6 lg:flex-row lg:items-stretch">
          {/* Left rail */}
          <aside className="flex w-full flex-col gap-4 lg:w-[340px]">
            <UnitCard />
            <AgentCard />
            <ProgressList step={step} />
          </aside>

          {/* Right door working panel (.fs-panel = the login door look, widened + full height) */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="fs-panel flex flex-1 flex-col" style={{ maxWidth: "none", width: "100%" }}>
              <span className="fs-knob" aria-hidden="true" />
              <TabBar step={step} />

              <StepPersonal />

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-[var(--rule)] pt-4">
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-soft)]">
                  <span className="size-1.5 rounded-full" style={{ background: "var(--positive, #2f9e63)" }} /> Saved automatically · step {step + 1} of 4
                </span>
                <span className="text-[11px] text-[var(--ink-soft)]">Questions? Annelise · 082 551 0934</span>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
