/**
 * lib/applications/docCategories.ts — the document slots an application asks for, DERIVED from declared income.
 *
 * Single source of truth shared by the apply wizard (which renders the upload slots) and the Step-1 free
 * assessment (which checks, server-side, which required slots are actually present). Pure — no AI, no IO.
 * Slots are requested to best support the declared income sources (ADDENDUM_14M §4).
 */
export interface DocCategory {
  key: string
  label: string
  hint: string
  single: boolean
  required: boolean
  /** Display section: "required" (ID + income proof) · "income" (added because of a declared extra income source)
   *  · "optional" (boosters + other). Separate from `required` (which gates submit). */
  tier: "required" | "income" | "optional"
  escapeLabel?: string
  escapeNote?: string
  named?: boolean
  booster?: boolean
}

/** Build the slot list from the applicant's declarations — DRIVEN by employment type, income sources, and ID type.
 *  POPIA-minimal (don't demand a payslip from a self-employed person) + corroboration-aware (require the document
 *  that verifies their specific declaration). The GATE (submit) is just the core few — conditional + optional
 *  slots appear (with a "why") but never block. Co-applicant/guarantor docs are collected via their own invites.
 *  @param idType the primary's ID type ("sa_id"|"passport"|"asylum_permit"|undefined) — foreign → permit slot. */
export function deriveDocCategories(positiveIncomeKeys: Set<string>, employmentType: string, idType?: string | null): DocCategory[] {
  const employed = employmentType === "permanent" || employmentType === "contract" || employmentType === "commission" || employmentType === "part_time"
  const variable = employmentType === "commission" || employmentType === "self_employed" || employmentType === "freelance"
  const has = (k: string) => positiveIncomeKeys.has(k)
  const foreign = !!idType && idType !== "sa_id"

  // ── REQUIRED CORE — the true minimum that makes a meaningful screen (these GATE submit) ──
  const cats: DocCategory[] = [
    { key: "id", label: "ID document", hint: foreign ? "Your passport." : "Your SA ID (smart card or green book) or passport.", single: true, required: true, tier: "required" },
  ]
  // Proof of income — ONE slot, the specific document driven by the employment status they chose.
  if (employed) {
    cats.push({ key: "payslips", label: "Latest payslip", hint: variable ? "Your most recent commission / payslip statement (3 is ideal)." : "Your latest payslip — your 3 most recent is ideal.", single: false, required: true, tier: "required", escapeLabel: "I don't have a payslip", escapeNote: "Without a payslip we lean on your bank statements — your agent will see this." })
  } else if (employmentType === "self_employed" || employmentType === "freelance") {
    cats.push({ key: "business_tax", label: "SARS Tax Compliance Status or ITA34", hint: "Proves your self-employed income to SARS — your 6-month statements (below) do the rest.", single: true, required: true, tier: "required", escapeLabel: "I don't have this yet", escapeNote: "Without it we lean on your bank statements — your agent will see this." })
  } else if (employmentType === "retired") {
    cats.push({ key: "pension_advice", label: "Pension / annuity advice slip", hint: "Your latest pension, annuity or provident-fund advice slip.", single: false, required: true, tier: "required", escapeLabel: "I don't have this", escapeNote: "Without it we lean on your bank statements — your agent will see this." })
  } else if (employmentType === "grant") {
    cats.push({ key: "grant_proof", label: "SASSA award letter", hint: "Your SASSA grant approval letter or card.", single: false, required: true, tier: "required", escapeLabel: "I don't have this", escapeNote: "Without it we lean on your bank statements — your agent will see this." })
  }
  // Bank statements — always, and the single most important document (income, housing, obligations, recency). No
  // skip-escape: it's the fallback that carries everything else, so it's the one true hard upload (besides ID).
  cats.push({ key: "bank_main", label: "Bank statements", hint: variable ? "6 months for the account your income is paid into — we average variable income over 6 months for the fairest result." : "3 consecutive months for the account your income is paid into.", single: false, required: true, tier: "required" })

  // ── CONDITIONAL — required ONLY when a declaration triggers it; shown with WHY, but don't gate completion ──
  if (foreign) {
    cats.push({ key: "permit_visa", label: "Permit / visa", hint: "Your valid permit or visa — needed for the immigration-compliance check.", single: true, required: false, tier: "required" })
  }
  if (has("rental")) {
    cats.push({ key: "rental_proof", label: "Rental income proof", hint: "The statement for the account that receives the rent, or a signed lease — to verify your declared rental income.", single: false, required: false, tier: "required", escapeLabel: "It's in my uploaded bank statements", escapeNote: "We'll verify the rental income from the recurring deposits in your bank statements instead." })
  }
  if (has("savings_interest") || has("dividends")) {
    // Honest escape: regular interest shows as deposits, but dividends are often irregular/reinvested and have no
    // extractor — so the bank statement may NOT corroborate them. Don't promise verification we can't deliver.
    cats.push({ key: "bank_savings", label: "Savings / investment statement", hint: "A statement for the account behind that income — to verify your declared investment income.", single: false, required: false, tier: "required", escapeLabel: "It may be in my bank statements", escapeNote: "We'll verify regular deposits from your statements — but irregular or reinvested investment income may still need its own statement to count." })
  }
  if (has("maintenance") || has("alimony")) {
    cats.push({ key: "maintenance_order", label: "Maintenance / court order", hint: "The court order and the statement for the account that receives the payments — to verify your declared maintenance.", single: false, required: false, tier: "required", escapeLabel: "It's in my uploaded bank statements", escapeNote: "We'll verify the payments from the recurring deposits in your bank statements instead." })
  }

  // ── OPTIONAL — strengthens the application; never gates. Each says how it helps. ──
  if (employed) {
    cats.push({ key: "employment_contract", label: "Employment contract / letter", hint: "Substantiates your salary — and can clear a probation flag if you started recently.", single: true, required: false, tier: "optional", booster: true })
  }
  cats.push({ key: "employer_reference", label: "Employer letter or reference", hint: "A note from your employer confirming your position and standing.", single: true, required: false, tier: "optional", booster: true })
  cats.push({ key: "landlord_reference", label: "Previous landlord reference", hint: "Your rental track record — valuable if you've rented before (first-time renters can skip).", single: true, required: false, tier: "optional", booster: true })
  cats.push({ key: "proof_of_savings", label: "Proof of savings / available funds", hint: "Speaks to your deposit affordability.", single: false, required: false, tier: "optional", booster: true })
  // Optional by default (the bank statement usually carries the address). FUTURE: a per-agency "require proof of
  // address" toggle (FICA / trust-account agencies may need it hard) — keep this slot easy to flip to required.
  cats.push({ key: "proof_of_address", label: "Proof of address", hint: "A utility bill or municipal account in your name — your bank statement often already shows this, so only if asked.", single: true, required: false, tier: "optional", booster: true })
  cats.push({ key: "other", label: "Other documents", hint: "Anything else that strengthens your application — name each one.", single: false, required: false, tier: "optional", named: true })
  return cats
}

/** Map a stored filename back to its doc category — paths are `{categoryKey}.ext` or `{categoryKey}_{id}.ext`. */
export function categoryForFilename(name: string, cats: DocCategory[]): string {
  const base = name.replace(/\.[^.]+$/, "")
  for (const k of [...cats.map((c) => c.key)].sort((a, b) => b.length - a.length)) {
    if (base === k || base.startsWith(`${k}_`)) return k
  }
  return "other"
}
