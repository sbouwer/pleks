import { createServiceClient } from "@/lib/supabase/server"

type SupabaseServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export interface PnLLine {
  date: string
  description: string
  amount_cents: number
  ref?: string
  sars_code?: string
}

export interface PropertyPnL {
  incomeLines: PnLLine[]
  expenseLines: PnLLine[]
  totalRentCents: number
  totalExpensesCents: number
  totalFeesCents: number
  totalNetCents: number
  depositHeldCents: number
}

export async function getPropertyPnL(
  db: SupabaseServiceClient,
  orgId: string,
  propertyId: string,
  from: Date,
  to: Date,
): Promise<PropertyPnL> {
  const { data: statements, error: stmtErr } = await db
    .from("owner_statements")
    .select("id, period_month, period_from, period_to, gross_income_cents, total_expenses_cents, management_fee_cents, management_fee_vat_cents, net_to_owner_cents, income_lines, expense_lines")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)
    .gte("period_from", from.toISOString().slice(0, 10))
    .lte("period_to", to.toISOString().slice(0, 10))
    .order("period_from", { ascending: true })

  if (stmtErr) console.error("propertyPnL statements:", stmtErr.message)

  let totalRentCents = 0
  let totalExpensesCents = 0
  let totalFeesCents = 0
  let totalNetCents = 0
  const incomeLines: PnLLine[] = []
  const expenseLines: PnLLine[] = []

  for (const s of statements ?? []) {
    totalRentCents += s.gross_income_cents ?? 0
    totalExpensesCents += s.total_expenses_cents ?? 0
    totalFeesCents += (s.management_fee_cents ?? 0) + (s.management_fee_vat_cents ?? 0)
    totalNetCents += s.net_to_owner_cents ?? 0

    const stmtIncome = Array.isArray(s.income_lines) ? (s.income_lines as PnLLine[]) : []
    const stmtExpenses = Array.isArray(s.expense_lines) ? (s.expense_lines as PnLLine[]) : []
    incomeLines.push(...stmtIncome)
    expenseLines.push(...stmtExpenses)

    const feeTotal = (s.management_fee_cents ?? 0) + (s.management_fee_vat_cents ?? 0)
    if (feeTotal > 0) {
      const period = s.period_from?.slice(0, 7) ?? s.period_month?.slice(0, 7) ?? ""
      const vatSuffix = s.management_fee_vat_cents ? " (incl. VAT)" : ""
      expenseLines.push({
        date: s.period_to ?? s.period_month ?? "",
        description: `Management fee${vatSuffix} — ${period}`,
        amount_cents: feeTotal,
        sars_code: "4255",
      })
    }
  }

  const { data: depositTxns, error: depErr } = await db
    .from("deposit_transactions")
    .select("amount_cents, direction")
    .eq("org_id", orgId)
    .in("transaction_type", ["deposit_received", "deposit_refund", "deposit_deduction"])

  if (depErr) console.error("propertyPnL deposits:", depErr.message)

  const depositHeldCents = (depositTxns ?? []).reduce(
    (sum, t) => sum + (t.direction === "credit" ? t.amount_cents : -t.amount_cents),
    0,
  )

  return {
    incomeLines,
    expenseLines,
    totalRentCents,
    totalExpensesCents,
    totalFeesCents,
    totalNetCents,
    depositHeldCents: Math.max(0, depositHeldCents),
  }
}
