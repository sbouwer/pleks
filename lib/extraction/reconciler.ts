/**
 * lib/extraction/reconciler.ts — deterministic cross-document reconciliation (ADDENDUM_14L Phase 3)
 *
 * NOT an AI call. §4.7's Sonnet reconciler is SUPERSEDED: once the Phase-2 extractors emit structured fields,
 * reconciliation is arithmetic + comparison — and determinism is load-bearing for FitScore replay (the POPIA
 * s71 defence; ADDENDUM_14H delivery §8 mechanism #5). A stochastic layer would poison replay. Stamped with
 * RECONCILER_VERSION so a 14M evaluation reconstructs exactly. Unresolved attribution → "uncorroborated"
 * (NEVER an AI guess) → 14M flag 5 remediation. Any future edit to the logic MUST bump RECONCILER_VERSION.
 *
 * Produces the Confidence axis the affordability prescreen (ADDENDUM_14M) rules over:
 *   declaredSources → flags 5/6 · housingPayment → flag 0 · netPayVsCredit → flag 8 ·
 *   identity → flag 7 · recency → flags 3/4. (Flags 10–13 are a named fast-follow — the outflows[] are here.)
 * Spec: ADDENDUM_14L §4.3/§4.4.
 */
import {
  RECONCILER_VERSION,
  type PipelineDocumentResult, type DeclaredContext, type DocumentType,
  type ReconciliationResult, type DeclaredSourceReconciliation, type IncomeMatchStatus,
  type ConsistencyVerdict, type HousingPaymentReconciliation, type NetPayVsCreditCheck,
  type DocumentRecency, type IdentityConsistency,
  type PayslipExtraction, type BankStatementExtraction, type EmployerLetterExtraction,
  type IRP5Extraction, type IDExtraction, type ProofOfAddressExtraction, type SavingsAccountDetailsExtraction,
} from "./types"

const VARIANCE_TOLERANCE = 0.10    // |declared − evidenced|/declared ≤ 10% → corroborated, else variance
const NET_CREDIT_TOLERANCE = 0.05  // net pay vs salary credit within 5% → match, else gap (flag 8)
const RECURRING_TOLERANCE = 0.15   // an inflow within 15% of declared, in ≥2 months, corroborates the source
const HOUSING_CATS = new Set(["rent", "home-loan"])

type Typed<T> = { path: string; ex: T }
function ofType<T>(results: PipelineDocumentResult[], type: DocumentType): Typed<T>[] {
  return results
    .filter((r) => r.documentType === type && r.extracted != null)
    .map((r) => ({ path: r.path, ex: r.extracted as unknown as T }))
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid]
}

const monthOf = (iso: string): string => iso.slice(0, 7)            // "YYYY-MM-DD" | "YYYY-MM" → "YYYY-MM"
function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  if (!fy || !fm || !ty || !tm) return []
  const out: string[] = []
  const endIdx = ty * 12 + (tm - 1)
  for (let idx = fy * 12 + (fm - 1); idx <= endIdx && out.length < 120; idx++) {
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`)
  }
  return out
}
/** True if a sorted unique YYYY-MM list has any internal gap (a missing month between first and last). */
function hasMonthGap(monthsSorted: string[]): boolean {
  if (monthsSorted.length < 2) return false
  const full = monthsBetween(monthsSorted[0], monthsSorted[monthsSorted.length - 1])
  return full.length !== monthsSorted.length
}

// ─── Income: declared source ↔ evidence ──────────────────────────────────────
function employmentEvidence(
  payslips: Typed<PayslipExtraction>[], letters: Typed<EmployerLetterExtraction>[],
  irp5s: Typed<IRP5Extraction>[], banks: Typed<BankStatementExtraction>[],
): { cents: number | null; docType: DocumentType | null } {
  // Precedence: payslip > employer letter > IRP5 (annual/12) > bank salary credit.
  const p = payslips.find((d) => d.ex.gross_pay_cents != null)
  if (p) return { cents: p.ex.gross_pay_cents, docType: "payslip" }
  const l = letters.find((d) => d.ex.gross_monthly_salary_cents != null)
  if (l) return { cents: l.ex.gross_monthly_salary_cents, docType: "employer-letter" }
  const i = irp5s.find((d) => d.ex.gross_remuneration_cents != null)
  if (i) return { cents: Math.round((i.ex.gross_remuneration_cents as number) / 12), docType: "irp5" }
  const b = banks.find((d) => d.ex.income_indicators.regular_salary_detected && d.ex.income_indicators.average_monthly_inflow_cents != null)
  if (b) return { cents: b.ex.income_indicators.average_monthly_inflow_cents, docType: "bank-statement" }
  return { cents: null, docType: null }
}

/** A recurring inflow within tolerance of `target`, seen in ≥2 distinct months → its median amount, else null. */
function recurringInflowNear(banks: Typed<BankStatementExtraction>[], target: number): number | null {
  if (target <= 0) return null
  const hits = banks.flatMap((b) => b.ex.inflows).filter((f) => Math.abs(f.amount_cents - target) <= target * RECURRING_TOLERANCE)
  const months = new Set(hits.map((f) => monthOf(f.date)))
  return months.size >= 2 ? median(hits.map((f) => f.amount_cents)) : null
}

function reconcileSource(
  src: NonNullable<DeclaredContext["incomeSources"]>[number],
  ev: { cents: number | null; docType: DocumentType | null; existenceOnly: boolean },
  anyDocs: boolean,
): DeclaredSourceReconciliation {
  const declared = src.monthly_cents
  let status: IncomeMatchStatus
  let variance: number | null = null
  let confidence = 0
  if (ev.cents != null) {
    variance = declared > 0 ? Math.round(((declared - ev.cents) / declared) * 100) : null   // divide-by-zero guard
    const within = declared <= 0 || Math.abs(declared - ev.cents) <= declared * VARIANCE_TOLERANCE
    status = within ? "corroborated" : "variance"
    confidence = within ? 0.9 : 0.6
  } else if (ev.existenceOnly) {
    status = "corroborated"; confidence = 0.6              // source evidenced as existing; amount not verified
  } else {
    status = anyDocs ? "uncorroborated" : "no-evidence"    // unresolved → flag 5 prompt, never a guess
  }
  return {
    source_key: src.key, label: src.label, declared_monthly_cents: declared,
    evidenced_monthly_cents: ev.cents, variance_pct: variance, match_confidence: confidence, status,
    evidenceDocType: ev.docType,
  }
}

function evidenceFor(
  key: string, declared: number,
  bags: {
    payslips: Typed<PayslipExtraction>[]; letters: Typed<EmployerLetterExtraction>[];
    irp5s: Typed<IRP5Extraction>[]; banks: Typed<BankStatementExtraction>[];
    savings: Typed<SavingsAccountDetailsExtraction>[];
  },
): { cents: number | null; docType: DocumentType | null; existenceOnly: boolean } {
  if (key === "employment") {
    const e = employmentEvidence(bags.payslips, bags.letters, bags.irp5s, bags.banks)
    return { ...e, existenceOnly: false }
  }
  if (key === "savings_interest") {
    return { cents: null, docType: bags.savings.length ? "savings-account-details" : null, existenceOnly: bags.savings.length > 0 }
  }
  if (key === "dividends") {
    return { cents: null, docType: null, existenceOnly: false }   // no extractor → uncorroborated → flag 5
  }
  // rental / maintenance / alimony / other_remuneration / custom → look for a recurring matching credit
  const amt = recurringInflowNear(bags.banks, declared)
  return { cents: amt, docType: amt != null ? "bank-statement" : null, existenceOnly: false }
}

// ─── Housing payment (flag 0) ─────────────────────────────────────────────────
function reconcileHousing(banks: Typed<BankStatementExtraction>[]): HousingPaymentReconciliation {
  const housing = banks.flatMap((b) => b.ex.outflows).filter((o) => HOUSING_CATS.has(o.counterparty_category))
  if (housing.length === 0) return { detected: false, recurring_monthly_cents: null, months_observed: 0, anyMissedOrReturned: false }
  const byMonth = new Map<string, number>()
  for (const o of housing) byMonth.set(monthOf(o.date), (byMonth.get(monthOf(o.date)) ?? 0) + o.amount_cents)
  const months = [...byMonth.keys()].sort((a, b) => a.localeCompare(b))
  return {
    detected: true,
    recurring_monthly_cents: median([...byMonth.values()]),
    months_observed: byMonth.size,
    anyMissedOrReturned: hasMonthGap(months),   // a skipped month inside the span (returned-debit cat is a fast-follow)
  }
}

// ─── Net pay vs salary credit (flag 8) ────────────────────────────────────────
function bankSalaryCredit(banks: Typed<BankStatementExtraction>[]): number | null {
  const salaryInflows = banks.flatMap((b) => b.ex.inflows).filter((f) => f.counterparty_category === "salary")
  if (salaryInflows.length > 0) return median(salaryInflows.map((f) => f.amount_cents))
  const b = banks.find((d) => d.ex.income_indicators.regular_salary_detected && d.ex.income_indicators.average_monthly_inflow_cents != null)
  return b ? b.ex.income_indicators.average_monthly_inflow_cents : null
}
function reconcileNetPay(payslips: Typed<PayslipExtraction>[], banks: Typed<BankStatementExtraction>[]): NetPayVsCreditCheck {
  const net = payslips.find((d) => d.ex.net_pay_cents != null)?.ex.net_pay_cents ?? null
  const credit = bankSalaryCredit(banks)
  if (net == null || credit == null || net <= 0) {
    return { payslip_net_cents: net, bank_salary_credit_cents: credit, gap_pct: null, verdict: "insufficient-data" }
  }
  const gap = Math.abs(net - credit) / net
  return { payslip_net_cents: net, bank_salary_credit_cents: credit, gap_pct: Math.round(gap * 100), verdict: gap <= NET_CREDIT_TOLERANCE ? "match" : "gap" }
}

// ─── Identity (flag 7) ────────────────────────────────────────────────────────
interface NameParts { first: string; middles: string[]; surname: string }
function normName(s: string | null | undefined): NameParts | null {
  if (!s) return null
  const cleaned = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()
  if (!cleaned) return null
  const parts = cleaned.split(" ")
  if (parts.length === 1) return { first: "", middles: [], surname: parts[0] }   // single token → surname only
  return { first: parts[0], middles: parts.slice(1, -1), surname: parts[parts.length - 1] }
}
const isInitialOf = (init: string, full: string): boolean => init.length === 1 && full.startsWith(init)
function compareTwoNames(a: NameParts, b: NameParts): ConsistencyVerdict {
  if (a.surname !== b.surname) return "material-mismatch"           // different surname = material (different person)
  if (a.first && b.first && a.first !== b.first && !isInitialOf(a.first, b.first) && !isInitialOf(b.first, a.first)) return "material-mismatch"
  const firstMinor = a.first !== b.first                            // initials-vs-full = minor
  const middleMinor = a.middles.join(" ") !== b.middles.join(" ")   // missing/extra middle name = minor
  return firstMinor || middleMinor ? "minor-variation" : "consistent"
}
function nameConsistency(names: Array<string | null | undefined>): ConsistencyVerdict {
  const parsed = names.map(normName).filter((n): n is NameParts => n !== null)
  if (parsed.length < 2) return "insufficient-data"
  let worst: ConsistencyVerdict = "consistent"
  for (let i = 1; i < parsed.length; i++) {
    const v = compareTwoNames(parsed[0], parsed[i])
    if (v === "material-mismatch") return "material-mismatch"
    if (v === "minor-variation") worst = "minor-variation"
  }
  return worst
}
function idConsistency(idNumbers: Array<string | null | undefined>): IdentityConsistency["idNumber"] {
  const present = idNumbers.map((s) => (s ?? "").replace(/\s/g, "")).filter(Boolean)
  if (present.length < 2) return "insufficient-data"
  return new Set(present).size > 1 ? "mismatch" : "consistent"
}

// ─── Recency + quantity (flags 3/4) ───────────────────────────────────────────
function reconcileRecency(dates: string[], salariedMonths: Set<string>, now: Date): DocumentRecency {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort((a, b) => a.localeCompare(b))
  const oldest = valid[0] ?? null
  const newest = valid[valid.length - 1] ?? null
  let withinDays: number | null = null
  if (newest) withinDays = Math.round((now.getTime() - new Date(`${newest}T00:00:00Z`).getTime()) / 86_400_000)
  const monthsCovered = [...salariedMonths].sort((a, b) => a.localeCompare(b))
  return {
    oldestDocumentDate: oldest, newestDocumentDate: newest, mostRecentWithinDays: withinDays,
    salariedMonthsCovered: monthsCovered.length, monthsCovered, consecutive: !hasMonthGap(monthsCovered),
  }
}

// ─── Orchestration ────────────────────────────────────────────────────────────
export function reconcile(
  results: PipelineDocumentResult[],
  declared: DeclaredContext | undefined,
  now: Date,
): ReconciliationResult {
  const payslips = ofType<PayslipExtraction>(results, "payslip")
  const banks = ofType<BankStatementExtraction>(results, "bank-statement")
  const letters = ofType<EmployerLetterExtraction>(results, "employer-letter")
  const irp5s = ofType<IRP5Extraction>(results, "irp5")
  const ids = ofType<IDExtraction>(results, "id-document")
  const proofs = ofType<ProofOfAddressExtraction>(results, "proof-of-address")
  const savings = ofType<SavingsAccountDetailsExtraction>(results, "savings-account-details")
  const anyDocs = results.some((r) => r.status === "classified" && r.extracted != null)
  const bags = { payslips, letters, irp5s, banks, savings }

  const declaredSources: DeclaredSourceReconciliation[] = (declared?.incomeSources ?? []).map((src) =>
    reconcileSource(src, evidenceFor(src.key, src.monthly_cents, bags), anyDocs),
  )

  // Recency inputs: representative dates + salaried months (payslip periods + bank statement spans).
  const dates: string[] = []
  const salariedMonths = new Set<string>()
  for (const p of payslips) {
    const pp = p.ex.pay_period
    if (!pp) continue
    const end = pp.includes("/") ? pp.split("/")[1] : pp
    salariedMonths.add(monthOf(end))
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) dates.push(end)
  }
  for (const b of banks) {
    if (b.ex.statement_period_to) dates.push(b.ex.statement_period_to)
    if (b.ex.statement_period_from && b.ex.statement_period_to) {
      for (const m of monthsBetween(monthOf(b.ex.statement_period_from), monthOf(b.ex.statement_period_to))) salariedMonths.add(m)
    }
  }
  for (const l of letters) if (l.ex.letter_date) dates.push(l.ex.letter_date)
  for (const pr of proofs) if (pr.ex.document_date) dates.push(pr.ex.document_date)
  for (const sv of savings) if (sv.ex.balance_date) dates.push(sv.ex.balance_date)

  const names = [declared?.applicant?.fullName, ...ids.map((d) => d.ex.full_name), ...payslips.map((d) => d.ex.employee_name), ...letters.map((d) => d.ex.employee_name), ...proofs.map((d) => d.ex.full_name)]
  const idNumbers = [declared?.applicant?.idNumber, ...ids.map((d) => d.ex.id_number)]

  return {
    reconcilerVersion: RECONCILER_VERSION,
    declaredSources,
    housingPayment: reconcileHousing(banks),
    netPayVsCredit: reconcileNetPay(payslips, banks),
    identity: { name: nameConsistency(names), idNumber: idConsistency(idNumbers) },
    recency: reconcileRecency(dates, salariedMonths, now),
  }
}
