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
import { ActionButton } from "@/components/ui/actions"
import { formatCipcReg } from "@/lib/validation/contact"
import { AddressFields } from "@/components/parties/partyFields"
import type { PartyAddressInput } from "@/lib/parties/partyValidation"
import { StepHeading } from "./applyShared"
import { ConsentVerify } from "./applyReview"
import { LineItemGrid, TotalLine } from "./applyIndividual"
import { type IncomeRow, totalMonthlyCents } from "./applyDomain"
import { formatZAR } from "@/lib/constants"

export interface CompanyInfo {
  // Identity — mirrors the canonical add-company global form (contacts.company_name/registration_number/
  // vat_number/primary_email/primary_phone). companyType + nature are apply-specific (entity type drives the
  // surety model; nature is context).
  companyType: string; companyReg: string
  name?: string; trading?: string; vat?: string; nature?: string
  companyEmail?: string; companyPhone?: string
  vatRegistered?: string         // "yes"|"no" — SARS legitimacy + a turnover sanity-check (Company details step)
  vatTurnover?: string           // declared annual VAT turnover (rands) — SARS-corroborable cross-check
  // Business address — a structured 25A address (reuses the AddressFields brick); its own tab.
  address?: PartyAddressInput
  // CASH-FLOW LEDGER (the affordability model): money in / money out as line items (per-line period, like the
  // personal grids), from which turnover (Σin) and the monthly surplus (Σin − Σout) are DERIVED. Debt service +
  // owner salary are out-lines (so no separate commitments field, no double-count with the director surety track).
  ledgerIn?: IncomeRow[]; ledgerOut?: IncomeRow[]
  // We ask for the MOST RECENT figures (management accounts OR latest AFS — whichever is freshest), reconciled
  // against the filed AFS at the shortlist check. figuresSource frames the recency; afsYear only matters for an AFS.
  figuresSource?: string         // "management_accounts"|"latest_afs"|"estimate"
  afsYear?: string               // (AFS only) financial year the figures are from → staleness vs today
  premisesMove?: string          // "relocate"|"additional" — gates the premises-rent demonstrated-payment read
  // Deprecated flat fields (pre-ledger) — kept ONLY for backward-compatible resume + engine fallback on old drafts.
  annualTurnover?: string; annualProfit?: string; monthlyCommitments?: string
  // The filler's own relationship to the company (apply-as "You" row): director / shareholder / guarantor / other
  // / owner, or on_behalf (an office manager not on the application). Drives imDirector; display/intent only.
  fillerDesignation?: string
}

// The ledger catalogs (mirror the personal INCOME/COMMITMENT catalogs). "premises_rent" is a fixed key so the
// engine can find the current-rent line for the relocate demonstrated-payment read.
export const COMPANY_IN_CATALOG = [{ group: "Money in", sources: [{ key: "trading_income", label: "Trading income" }, { key: "other_income", label: "Other income" }, { key: "other", label: "Other…" }] }]
export const COMPANY_OUT_CATALOG = [{ group: "Money out", sources: [
  { key: "owner_remuneration", label: "Director / owner remuneration" }, { key: "salaries", label: "Staff salaries & wages" },
  { key: "premises_rent", label: "Premises rent" }, { key: "vehicle_asset", label: "Vehicle / asset finance" },
  { key: "loan_repayments", label: "Loan repayments" }, { key: "operating_costs", label: "Operating costs" },
  { key: "other", label: "Other…" },
] }]
const DEFAULT_LEDGER_IN: IncomeRow[] = [{ key: "trading_income", label: "Trading income", amount: "", period: "annual" }]
const DEFAULT_LEDGER_OUT: IncomeRow[] = [
  { key: "owner_remuneration", label: "Director / owner remuneration", amount: "", period: "annual" },
  { key: "operating_costs", label: "Operating costs", amount: "", period: "annual" },
]
const PREMISES_MOVE_OPTIONS = [
  { value: "relocate", label: "Relocating — this rent replaces the premises above" },
  { value: "additional", label: "Additional space — the rent above continues too" },
]
const VAT_REGISTERED_OPTIONS = [{ value: "", label: "Select…" }, { value: "no", label: "Not VAT-registered" }, { value: "yes", label: "VAT-registered" }]
const FIGURES_SOURCE_OPTIONS = [
  { value: "", label: "Select…" },
  { value: "management_accounts", label: "Recent management accounts" },
  { value: "latest_afs", label: "Latest annual financial statements (AFS)" },
  { value: "estimate", label: "My best estimate" },
]

/** AFS financial-year options for staleness — this year back a few, plus "older". Built at render (client). */
function afsYearOptions(): { value: string; label: string }[] {
  const now = new Date().getFullYear()
  const years = [0, 1, 2, 3].map((d) => ({ value: String(now - d), label: String(now - d) }))
  return [{ value: "", label: "Select…" }, ...years, { value: "older", label: `${now - 4} or older` }]
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

// The company TYPE forks the whole flow — JURISTIC (separate legal person) vs UNINCORPORATED (the human is the
// applicant). The classifier is the lib SSOT (shared with the assessment engine so the branching can't drift).
import { isJuristicCompanyType } from "@/lib/applications/companyTypes"
export { isJuristicCompanyType }

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
  // Cash-flow ledger (seeded if untouched) + derived figures for the summary.
  const ledgerIn = company.ledgerIn ?? DEFAULT_LEDGER_IN
  const ledgerOut = company.ledgerOut ?? DEFAULT_LEDGER_OUT
  const turnoverMonthly = totalMonthlyCents(ledgerIn)
  const surplusMonthly = turnoverMonthly - totalMonthlyCents(ledgerOut)
  const hasPremisesRent = ledgerOut.some((r) => r.key === "premises_rent")
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
                <TextField label={regLabel} value={company.companyReg} onChange={(v) => set({ companyReg: v })} required placeholder="e.g. 2019/123456/07" format={company.companyType === "trust" ? undefined : formatCipcReg} />
                <TextField label="Nature of business" value={company.nature ?? ""} onChange={(v) => set({ nature: v })} placeholder="e.g. IT consulting" />
                <SelectField label="VAT registered?" value={company.vatRegistered ?? ""} onChange={(v) => set({ vatRegistered: v })} options={VAT_REGISTERED_OPTIONS} />
                {company.vatRegistered === "yes" && <TextField label="VAT number" value={company.vat ?? ""} onChange={(v) => set({ vat: v })} placeholder="4xxxxxxxxx" />}
                {company.vatRegistered === "yes" && <TextField label="VAT turnover (annual, R)" value={company.vatTurnover ?? ""} onChange={(v) => set({ vatTurnover: v })} placeholder="e.g. 2 400 000" />}
                <TextField label="Company email" type="email" value={company.companyEmail ?? ""} onChange={(v) => set({ companyEmail: v })} placeholder="info@company.co.za" />
                <TextField label="Company phone" type="tel" value={company.companyPhone ?? ""} onChange={(v) => set({ companyPhone: v })} placeholder="021 000 0000" />
              </FieldGrid>
            </>
          ) : (
            <>
              <StepHeading title="Business information" sub={`Your business details. ${imDirector ? "You'll add your own details and income next — that's what we assess." : "We'll then email the owner to complete their part."}`} />
              <FieldGrid>
                <TextField label="Trading name" value={company.trading ?? ""} onChange={(v) => set({ trading: v })} required placeholder="e.g. Plumbing & Sons" />
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
          <StepHeading title="Company finances" sub="Your most recent figures — management accounts or your latest AFS, whichever is freshest. Pick the period for each line; we convert to monthly. The surplus is what we weigh the rent against, and we reconcile these against your filed AFS at the shortlist check." />
          <FieldGrid>
            <SelectField label="Source of these figures" value={company.figuresSource ?? ""} onChange={(v) => set({ figuresSource: v })} options={FIGURES_SOURCE_OPTIONS} />
            {company.figuresSource === "latest_afs" && <SelectField label="AFS financial year" value={company.afsYear ?? ""} onChange={(v) => set({ afsYear: v })} options={afsYearOptions()} />}
          </FieldGrid>
          <LineItemGrid rows={ledgerIn} setRows={(r) => set({ ledgerIn: r })} catalog={COMPANY_IN_CATALOG} headerLabel="Money in" addLabel="Add an income line" emptyLabel="Add each income stream the company earns." defaultPeriod="annual" />
          <LineItemGrid rows={ledgerOut} setRows={(r) => set({ ledgerOut: r })} catalog={COMPANY_OUT_CATALOG} headerLabel="Money out" addLabel="Add a cost line" emptyLabel="Add the company's costs — salaries, rent, finance, loans, operating costs." defaultPeriod="annual" />
          <p className="text-[11px] leading-relaxed text-[var(--ink-mute)]">Keep your own drawings on the <span className="text-[var(--ink-soft)]">Director / owner remuneration</span> line, separate from staff salaries — we use it both for the company&apos;s true surplus and for your own capacity as a director (no double-count).</p>
          {hasPremisesRent && (
            <SelectField label="The premises rent above is for…" value={company.premisesMove ?? "relocate"} onChange={(v) => set({ premisesMove: v })} options={PREMISES_MOVE_OPTIONS} />
          )}
          <div className="border-t border-[var(--rule)] pt-3 text-sm">
            <TotalLine label="Turnover (money in)" cents={turnoverMonthly} />
            <TotalLine label="Monthly surplus (in − out)" cents={surplusMonthly} strong={false} />
            {turnoverMonthly > 0 && (
              <p className="mt-1.5 text-[11px] text-[var(--ink-mute)]">Cash surplus ratio {Math.round((surplusMonthly / turnoverMonthly) * 100)}% — what&apos;s left after costs (including owner salary &amp; debt service).</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CoReviewLine({ k, v }: Readonly<{ k: string; v: string }>) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--rule)] py-1.5 last:border-0">
      <span className="shrink-0 text-[var(--ink-mute)]">{k}</span>
      <span className="text-right font-medium text-[var(--ink)]">{v}</span>
    </div>
  )
}

/** The COMPANY applicant's sign-off — the last pane of the company section. Confirm the entity, verify the email and
 *  consent on the company's behalf. After this the per-applicant roster takes over (the director then does their own
 *  section). consent + email-verified gate the forward action (the orchestrator). */
export function StepCompanyReview({ company, signOffEmail, applicationId, token, emailVerified, onVerified, consent, setConsent, imDirector, companyRole, onContinue, busy }: Readonly<{
  company: CompanyInfo; applicationId: string | null; token: string | null; emailVerified: boolean; onVerified: () => void
  /** The email the OTP actually goes to — the application's applicant_email (the director / on-behalf primary), NOT
   *  the optional company contact email. Display must match what's sent or it reads "Code sent to undefined". */
  signOffEmail?: string
  consent: boolean; setConsent: (v: boolean) => void; imDirector: boolean; companyRole: string
  /** The forward action — director continues to their own section; office-manager sends to the named director. Lives
   *  here (bottom-right) like the other consent/review panes, not in the top nav. */
  onContinue: () => void; busy?: boolean
}>) {
  const regLabel = company.companyType === "trust" ? "Master's reference" : "CIPC registration"
  const ledgerIn = company.ledgerIn ?? []
  const ledgerOut = company.ledgerOut ?? []
  const hasLedger = ledgerIn.length > 0 || ledgerOut.length > 0
  const turnoverMo = totalMonthlyCents(ledgerIn)
  const surplusMo = turnoverMo - totalMonthlyCents(ledgerOut)
  return (
    <div className="flex min-h-full flex-col gap-6">
      <StepHeading title="Company review & consent" sub={imDirector ? "Confirm the company's details, verify your email and consent — then you'll continue to your own director application." : `Confirm the company's details, verify your email and consent — then we'll email the ${companyRole} to complete their personal application.`} />
      <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4 text-sm">
        <CoReviewLine k="Registered name" v={company.name || "—"} />
        {company.trading ? <CoReviewLine k="Trading as" v={company.trading} /> : null}
        <CoReviewLine k={regLabel} v={company.companyReg || "—"} />
        {company.vat ? <CoReviewLine k="VAT number" v={company.vat} /> : null}
        {company.nature ? <CoReviewLine k="Nature of business" v={company.nature} /> : null}
        {hasLedger ? (
          <>
            <CoReviewLine k="Turnover (monthly)" v={formatZAR(turnoverMo)} />
            <CoReviewLine k="Monthly surplus" v={formatZAR(surplusMo)} />
          </>
        ) : (
          <>
            <CoReviewLine k="Annual turnover" v={company.annualTurnover ? `R ${company.annualTurnover}` : "—"} />
            <CoReviewLine k="Annual net profit" v={company.annualProfit ? `R ${company.annualProfit}` : "—"} />
          </>
        )}
      </div>
      <ConsentVerify applicationId={applicationId} token={token} email={signOffEmail} verified={emailVerified} onVerified={onVerified} consent={consent} setConsent={setConsent}>
        I&apos;m authorised to apply on behalf of the company, and I consent to Pleks processing the company&apos;s information for this rental pre-selection (no credit check at this stage).
      </ConsentVerify>
      {/* Primary action bottom-right (consistent with the other consent/review panes — not in the top nav). */}
      <div className="mt-auto flex justify-end pt-3">
        <ActionButton tone="primary" onClick={onContinue} disabled={busy || !consent || !emailVerified}>
          {imDirector ? "Continue to your application" : `Send to the ${companyRole}`}
        </ActionButton>
      </div>
    </div>
  )
}
