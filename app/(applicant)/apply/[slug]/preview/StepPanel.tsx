"use client"

/**
 * app/(applicant)/apply/[slug]/preview/StepPanel.tsx — the interactive right "door" panel of the apply preview
 *
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  Client island for the apply preview (the server page renders the shell + left cards). Holds the
 *         tab bar + the Step-1 Personal-details form (shared forms field grammar = the add-tenant capture).
 *         Agent name/phone are passed from the server page for the footer "Questions?" line.
 */

import { useState } from "react"
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"

const STEPS = ["Personal details", "Applicants", "Documents", "Score"]

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

function TabBar({ step }: Readonly<{ step: number }>) {
  return (
    <div className="flex gap-5 border-b border-[var(--rule)]">
      {STEPS.map((label, i) => {
        const done = i < step
        const cur = i === step
        return (
          <span key={label} className={`flex items-center gap-2 pb-2.5 text-[13px] ${tabClass(done, cur)}`}>
            <span className={`flex size-[18px] items-center justify-center rounded-full text-[10px] ${circleClass(done, cur)}`}>{done ? "✓" : i + 1}</span>
            {label}
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
    <div className="flex flex-1 flex-col gap-4 py-3">
      <div>
        <h2 className="text-xl font-medium tracking-[-0.01em] text-[var(--ink)]">Tell us about you</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">
          A few details to start your application — free, no credit check at this stage. We collect consent now so a lawful credit check can run later if you&apos;re shortlisted.
        </p>
      </div>

      <Segmented value={f.leaseType} onChange={set("leaseType")} />

      <FieldGrid>
        <TextField label="Full name" value={f.fullName} onChange={set("fullName")} span required placeholder="Your full name" />
        <TextField label="SA ID number" value={f.idNumber} onChange={set("idNumber")} required placeholder="13-digit ID number" maxLength={13} />
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

export function StepPanel({ agentName, agentPhone, step = 0 }: Readonly<{ agentName: string | null; agentPhone: string | null; step?: number }>) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="fs-panel mb-1.5 flex flex-1 flex-col" style={{ maxWidth: "none", width: "100%" }}>
        <span className="fs-knob" aria-hidden="true" />
        <TabBar step={step} />

        <StepPersonal />

        <div className="flex items-center justify-between border-t border-[var(--rule)] pt-4">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-soft)]">
            <span className="size-1.5 rounded-full" style={{ background: "var(--positive, #2f9e63)" }} /> Saved automatically · step {step + 1} of 4
          </span>
          {(agentName || agentPhone) && (
            <span className="text-[11px] text-[var(--ink-soft)]">
              Questions? {[agentName, agentPhone].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </div>
    </main>
  )
}
