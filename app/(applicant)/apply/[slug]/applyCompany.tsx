"use client"

/**
 * app/(applicant)/apply/[slug]/applyCompany.tsx — the COMPANY application flow (its own concern)
 *
 * Notes:  Self-contained company flow — a tabbed sub-flow: business identity · address · annual finances. A
 *         company is a DIFFERENT animal from a consumer (different reasoning/weight/rules/outputs), so this never
 *         mixes with applyIndividual; the orchestrator sequences company → (the director's) individual flow.
 *         Shares only bricks + styling (form fields, AddressFields, StepHeading).
 */
import { FieldGrid, TextField, SelectField } from "@/components/forms/fields"
import { AddressFields } from "@/components/parties/partyFields"
import type { PartyAddressInput } from "@/lib/parties/partyValidation"
import { StepHeading } from "./applyShared"

export interface CompanyInfo {
  // Identity — mirrors the canonical add-company global form (contacts.company_name/registration_number/
  // vat_number/primary_email/primary_phone). companyType + nature are apply-specific (entity type drives the
  // surety model; nature is context).
  companyType: string; companyReg: string
  name?: string; trading?: string; vat?: string; nature?: string
  companyEmail?: string; companyPhone?: string
  // Business address — a structured 25A address (reuses the AddressFields brick); its own tab.
  address?: PartyAddressInput
  annualTurnover?: string; annualProfit?: string
}

// The company phase is a short tabbed sub-flow (its own nav, like the main wizard) run before the personal flow.
export const COMPANY_SUBTABS = ["Company information", "Business address", "Finances"] as const

export const COMPANY_TYPE_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "pty_ltd", label: "(Pty) Ltd" },
  { value: "cc", label: "Close Corporation (CC)" },
  { value: "npc", label: "Non-Profit Company" },
  { value: "trust", label: "Trust" },
  { value: "sole_prop", label: "Sole proprietor" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other" },
]

/** Company-phase sub-tabs (info · address · finances) — mirrors the main wizard's SubTabs; all three reachable. */
export function CompanySubTabs({ step, onJump }: Readonly<{ step: number; onJump: (s: number) => void }>) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--rule)]">
      {COMPANY_SUBTABS.map((label, s) => {
        const cur = s === step
        return (
          <button key={label} type="button" disabled={cur} onClick={() => onJump(s)}
            className={`relative pb-1.5 text-[12px] ${cur ? "font-medium text-[var(--ink)]" : "cursor-pointer text-[var(--ink-mute)] hover:text-[var(--ink)]"}`}>
            {label}
            {cur && <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-[var(--amber)]" />}
          </button>
        )
      })}
    </div>
  )
}

export function StepCompanyDetails({ company, setCompany, imDirector, companyStep }: Readonly<{ company: CompanyInfo; setCompany: (v: CompanyInfo) => void; imDirector: boolean; companyStep: number }>) {
  const set = (patch: Partial<CompanyInfo>) => setCompany({ ...company, ...patch })
  const addr: PartyAddressInput = company.address ?? { type: "physical" }
  return (
    <div className="flex flex-col gap-6">
      {companyStep === 0 && (
        <>
          <StepHeading title="Company information" sub={imDirector ? "The business applying — you'll add your own director details next." : "The business applying — we'll then email the director to complete their part."} />
          <FieldGrid>
            <TextField label="Registered name" value={company.name ?? ""} onChange={(v) => set({ name: v })} required />
            <TextField label="Trading name (if different)" value={company.trading ?? ""} onChange={(v) => set({ trading: v })} />
            <SelectField label="Company type" value={company.companyType} onChange={(v) => set({ companyType: v })} required options={COMPANY_TYPE_OPTIONS} />
            <TextField label="CIPC reg. number" value={company.companyReg} onChange={(v) => set({ companyReg: v })} placeholder="e.g. 2019/123456/07" />
            <TextField label="VAT number (if registered)" value={company.vat ?? ""} onChange={(v) => set({ vat: v })} />
            <TextField label="Nature of business" value={company.nature ?? ""} onChange={(v) => set({ nature: v })} placeholder="e.g. IT consulting" />
            <TextField label="Company email" type="email" value={company.companyEmail ?? ""} onChange={(v) => set({ companyEmail: v })} placeholder="info@company.co.za" />
            <TextField label="Company phone" type="tel" value={company.companyPhone ?? ""} onChange={(v) => set({ companyPhone: v })} placeholder="021 000 0000" />
          </FieldGrid>
        </>
      )}
      {companyStep === 1 && (
        <>
          <StepHeading title="Business address" sub="The company's registered / trading address." />
          <AddressFields address={addr} onUpdate={(p) => set({ address: { ...addr, ...p } })} />
        </>
      )}
      {companyStep === 2 && (
        <>
          <StepHeading title="Annual finances" sub="From your latest AFS — you'll upload the statements at the documents step." />
          <FieldGrid>
            <TextField label="Annual turnover (R)" value={company.annualTurnover ?? ""} onChange={(v) => set({ annualTurnover: v })} placeholder="e.g. 2 400 000" />
            <TextField label="Annual net profit (R)" value={company.annualProfit ?? ""} onChange={(v) => set({ annualProfit: v })} placeholder="e.g. 600 000" />
          </FieldGrid>
        </>
      )}
    </div>
  )
}
