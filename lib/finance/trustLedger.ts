/**
 * lib/finance/trustLedger.ts — trust ledger presentation: type labels + CSV / printable-HTML builders
 *
 * Notes:  pure formatting helpers (no DB, no gate) — running balance is computed over the passed-in entries
 */
import { escapeCsvCell } from "@/lib/security/csvInjection"

export interface TrustLedgerEntry {
  id: string
  date: string
  reference: string | null
  transaction_type: string
  description: string
  direction: "credit" | "debit"
  amount_cents: number
  property_name: string | null
}

const TYPE_LABELS: Record<string, string> = {
  rent_received:    "Rent received",
  deposit_received: "Deposit received",
  deposit_interest: "Deposit interest",
  expense_paid:     "Expense paid",
  management_fee:   "Management fee",
  owner_payment:    "Owner payout",
  deposit_returned: "Deposit returned",
  deposit_deduction:"Deposit deduction",
  adjustment:       "Adjustment",
}

export function formatTrustType(type: string): string {
  return TYPE_LABELS[type] ?? type.replaceAll("_", " ")
}

export function buildTrustLedgerCSV(entries: TrustLedgerEntry[]): string {
  const rows = [
    ["Date", "Reference", "Type", "Description", "Property", "In (ZAR)", "Out (ZAR)", "Balance"].join(","),
  ]
  let balance = 0
  for (const e of entries) {
    if (e.direction === "credit") { balance += e.amount_cents }
    else { balance -= e.amount_cents }
    const inAmt = e.direction === "credit" ? (e.amount_cents / 100).toFixed(2) : ""
    const outAmt = e.direction === "debit" ? (e.amount_cents / 100).toFixed(2) : ""
    // Every cell through the SSOT. Two bugs died here at once: `reference` and `property_name` were not quoted
    // AT ALL, so an agency property called "Unit 3, Sea Point" split the row and shifted every column after it;
    // and nothing anywhere neutralised a formula lead, in a file whose whole purpose is to be opened in Excel.
    rows.push([
      escapeCsvCell(e.date),
      escapeCsvCell(e.reference ?? ""),
      escapeCsvCell(formatTrustType(e.transaction_type)),
      escapeCsvCell(e.description ?? ""),
      escapeCsvCell(e.property_name ?? ""),
      escapeCsvCell(inAmt),
      escapeCsvCell(outAmt),
      escapeCsvCell((balance / 100).toFixed(2)),
    ].join(","))
  }
  return rows.join("\n")
}
