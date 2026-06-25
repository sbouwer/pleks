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

// The company TYPE forks the whole flow. JURISTIC = a separate legal person (CIPC/Master registration + AFS +
// director/trustee signs surety + company-net-profit affordability). Everything else (sole proprietor, partnership,
// other) is UNINCORPORATED — the human(s) ARE the applicant: business overlay (trading name + business address +
// nature) then their own personal flow + personal affordability, signed personally. No CIPC, no AFS, no surety.
const JURISTIC_COMPANY_TYPES = ["pty_ltd", "cc", "npc", "trust"]
export const isJuristicCompanyType = (t: string) => JURISTIC_COMPANY_TYPES.includes(t)

/** The company phase's sub-tabs depend on the type — unincorporated has no AFS/Finances tab (personal income). */
export function companySubtabsFor(companyType: string): readonly string[] {
  return isJuristicCompanyType(companyType)
    ? ["Company information", "Business address", "Finances"]
    : ["Business information", "Business address"]
}

/** Company-phase sub-tabs (type-dependent — see companySubtabsFor); mirrors the main wizard's SubTabs. */
export function CompanySubTabs({ subtabs, step, onJump }: Readonly<{ subtabs: readonly string[]; step: number; onJump: (s: number) => void }>) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--rule)]">
      {subtabs.map((label, s) => {
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
  const juristic = isJuristicCompanyType(company.companyType)
  const regLabel = company.companyType === "trust" ? "Master's reference no." : "CIPC reg. number"
  const continueNote = imDirector ? "You'll add your own director details next." : "We'll then email the director to complete their part."
  return (
    <div className="flex flex-col gap-6">
      {companyStep === 0 && (
        <>
          {juristic ? (
            <>
              <StepHeading title="Company information" sub={`The registered entity applying. ${continueNote}`} />
              <FieldGrid>
                <TextField label="Registered name" value={company.name ?? ""} onChange={(v) => set({ name: v })} required />
                <TextField label="Trading name (if different)" value={company.trading ?? ""} onChange={(v) => set({ trading: v })} />
                <SelectField label="Company type" value={company.companyType} onChange={(v) => set({ companyType: v })} required options={COMPANY_TYPE_OPTIONS} />
                <TextField label={regLabel} value={company.companyReg} onChange={(v) => set({ companyReg: v })} required placeholder="e.g. 2019/123456/07" />
                <TextField label="VAT number (if registered)" value={company.vat ?? ""} onChange={(v) => set({ vat: v })} />
                <TextField label="Nature of business" value={company.nature ?? ""} onChange={(v) => set({ nature: v })} placeholder="e.g. IT consulting" />
                <TextField label="Company email" type="email" value={company.companyEmail ?? ""} onChange={(v) => set({ companyEmail: v })} placeholder="info@company.co.za" />
                <TextField label="Company phone" type="tel" value={company.companyPhone ?? ""} onChange={(v) => set({ companyPhone: v })} placeholder="021 000 0000" />
              </FieldGrid>
            </>
          ) : (
            <>
              <StepHeading title="Business information" sub={`Your business details. ${imDirector ? "You'll add your own details and income next — that's what we assess." : "We'll then email the owner to complete their part."}`} />
              <FieldGrid>
                <TextField label="Trading name" value={company.trading ?? ""} onChange={(v) => set({ trading: v })} required placeholder="e.g. DW Plumbing" />
                <SelectField label="Business type" value={company.companyType} onChange={(v) => set({ companyType: v })} required options={COMPANY_TYPE_OPTIONS} />
                <TextField label="VAT number (if registered)" value={company.vat ?? ""} onChange={(v) => set({ vat: v })} />
                <TextField label="Nature of business" value={company.nature ?? ""} onChange={(v) => set({ nature: v })} placeholder="e.g. IT consulting" />
                <TextField label="Business email" type="email" value={company.companyEmail ?? ""} onChange={(v) => set({ companyEmail: v })} placeholder="info@business.co.za" />
                <TextField label="Business phone" type="tel" value={company.companyPhone ?? ""} onChange={(v) => set({ companyPhone: v })} placeholder="021 000 0000" />
              </FieldGrid>
              <p className="text-xs leading-relaxed text-[var(--ink-soft)]">A sole proprietor / partnership isn&apos;t a separate legal entity — affordability is assessed on your own income, which you&apos;ll add in the personal step next.</p>
            </>
          )}
        </>
      )}
      {companyStep === 1 && (
        <>
          <StepHeading title="Business address" sub={juristic ? "The company's registered / trading address." : "Your business address (may differ from your home address)."} />
          <AddressFields address={addr} onUpdate={(p) => set({ address: { ...addr, ...p } })} />
        </>
      )}
      {companyStep === 2 && juristic && (
        <>
          <StepHeading title="Annual finances" sub="From your latest AFS — you'll upload the statements at the documents step. Net profit is the affordability figure (turnover is context); director surety backs it." />
          <FieldGrid>
            <TextField label="Annual turnover (R)" value={company.annualTurnover ?? ""} onChange={(v) => set({ annualTurnover: v })} placeholder="e.g. 2 400 000" />
            <TextField label="Annual net profit (R)" value={company.annualProfit ?? ""} onChange={(v) => set({ annualProfit: v })} placeholder="e.g. 600 000" />
          </FieldGrid>
        </>
      )}
    </div>
  )
}
