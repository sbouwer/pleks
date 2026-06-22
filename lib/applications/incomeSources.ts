/**
 * lib/applications/incomeSources.ts — validate + bound the applicant's declared income breakdown.
 *
 * Shared by the public apply routes (create + save-draft). Never trusts the client's monthly figure —
 * RECOMPUTES monthly_cents server-side and caps rows / amounts / label length. income_sources is the source
 * of truth; the derived monthly total is the affordability anchor (ADDENDUM_14M).
 */
const INCOME_PERIODS = ["month", "quarter", "annual"] as const
type IncomePeriod = typeof INCOME_PERIODS[number]
const PERIOD_DIVISOR: Record<IncomePeriod, number> = { month: 1, quarter: 3, annual: 12 }
const MAX_INCOME_ROWS = 20
const MAX_AMOUNT_CENTS = 1_000_000_000 // R10m per period — generous ceiling that rejects garbage

export type StoredIncomeRow = { key: string; label: string; amount_cents: number; period: IncomePeriod; monthly_cents: number }

export function parseIncomeSources(raw: unknown): { rows: StoredIncomeRow[]; totalMonthlyCents: number } | null {
  if (!Array.isArray(raw)) return null
  const rows: StoredIncomeRow[] = []
  for (const item of raw.slice(0, MAX_INCOME_ROWS)) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const period: IncomePeriod = INCOME_PERIODS.includes(r.period as IncomePeriod) ? (r.period as IncomePeriod) : "month"
    const amount_cents = Math.min(MAX_AMOUNT_CENTS, Math.max(0, Math.round(Number(r.amount_cents) || 0)))
    if (amount_cents <= 0) continue
    rows.push({
      key: typeof r.key === "string" ? r.key.slice(0, 40) : "",
      label: typeof r.label === "string" ? r.label.slice(0, 60) : "",
      amount_cents,
      period,
      monthly_cents: Math.round(amount_cents / PERIOD_DIVISOR[period]),
    })
  }
  const totalMonthlyCents = rows.reduce((s, r) => s + r.monthly_cents, 0)
  return { rows, totalMonthlyCents }
}
