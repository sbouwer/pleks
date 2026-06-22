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
  escapeLabel?: string
  escapeNote?: string
  named?: boolean
  booster?: boolean
}

/** Build the slot list from the set of income-source keys that carry a positive declared amount. */
export function deriveDocCategories(positiveIncomeKeys: Set<string>, employmentType: string): DocCategory[] {
  const variable = employmentType === "commission" || employmentType === "self_employed"
  const has = (k: string) => positiveIncomeKeys.has(k)
  const cats: DocCategory[] = [
    { key: "id", label: "ID document", hint: "Your SA ID (smart card or green book) or passport.", single: true, required: true },
  ]
  if (has("employment")) {
    cats.push({ key: "payslips", label: "Payslips", hint: variable ? "Your 3 most recent commission / payslip statements — one file or several." : "Your 3 most recent payslips — a combined PDF or separate files.", single: false, required: false, escapeLabel: "I don't have 3 payslips — I'll upload what I have", escapeNote: "Fewer payslips means we can verify less of your income — your agent will see this." })
  }
  cats.push({ key: "bank_main", label: "Bank statement — main account", hint: variable ? "6 months for the account your income is paid into — we average variable income over 6 months for the fairest result." : "3 consecutive months for the account your income is paid into.", single: false, required: true, escapeLabel: "I don't have all the requested statements — I'll upload what I have", escapeNote: "Fewer months means we can verify less of your income — your agent will see this." })
  if (has("savings_interest") || has("dividends")) {
    cats.push({ key: "bank_savings", label: "Savings / investment statement", hint: "A statement for the savings or investment account behind that income.", single: false, required: false, escapeLabel: "I can't supply this", escapeNote: "Extra declared income can't be verified if you don't supply additional information — it won't count towards your affordability." })
  }
  // Optional boosters — shown with a "when it helps" explanation; they raise confidence, never required.
  if (has("employment")) {
    cats.push({ key: "employment_letter", label: "Employment letter or contract", hint: "Substantiates your job and salary — especially helpful if you started recently (it can clear a probation flag).", single: true, required: false, booster: true })
  }
  cats.push({ key: "current_lease", label: "Current lease / rental agreement", hint: "If you already rent, add your lease — it proves what you currently afford and can lift your affordability result.", single: true, required: false, booster: true })
  cats.push({ key: "other", label: "Other documents", hint: "Anything else that strengthens your application — name each one (e.g. previous rental reference, court order, foreign bank statement).", single: false, required: false, named: true })
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
