import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { formatZAR } from "@/lib/constants"
import { ArrowLeft, Download } from "lucide-react"
import { PrintButton } from "./PrintButton"
import { Button } from "@/components/ui/button"

type LedgerEntry = {
  id: string
  date: string
  type: "invoice" | "payment" | "deposit" | "interest"
  description: string
  debitCents: number
  creditCents: number
  ref: string | null
}

function buildInvoiceEntries(invoices: {
  id: string
  invoice_number: string
  due_date: string
  total_amount_cents: number
  period_from: string | null
  period_to: string | null
  status: string
}[]): LedgerEntry[] {
  return invoices.map((inv) => ({
    id: "inv-" + inv.id,
    date: inv.due_date,
    type: "invoice" as const,
    description: "Rent invoice" + (inv.period_from ? " · " + inv.period_from + " to " + (inv.period_to ?? "") : ""),
    debitCents: inv.total_amount_cents,
    creditCents: 0,
    ref: inv.invoice_number,
  }))
}

function buildPaymentEntries(payments: {
  id: string
  payment_date: string
  amount_cents: number
  payment_method: string
  reference: string | null
  receipt_number: string | null
}[]): LedgerEntry[] {
  return payments.map((p) => ({
    id: "pmt-" + p.id,
    date: p.payment_date,
    type: "payment" as const,
    description: "Payment received · " + p.payment_method.replaceAll("_", " "),
    debitCents: 0,
    creditCents: p.amount_cents,
    ref: p.receipt_number ?? p.reference,
  }))
}

function buildDepositEntries(deposits: {
  id: string
  created_at: string
  transaction_type: string
  amount_cents: number
  direction: string
  description: string | null
  reference: string | null
}[]): LedgerEntry[] {
  return deposits.map((d) => ({
    id: "dep-" + d.id,
    date: d.created_at.split("T")[0],
    type: "deposit" as const,
    description: d.description ?? d.transaction_type.replaceAll("_", " "),
    debitCents: d.direction === "debit" ? d.amount_cents : 0,
    creditCents: d.direction === "credit" ? d.amount_cents : 0,
    ref: d.reference,
  }))
}

function BalancePill({ cents }: Readonly<{ cents: number }>) {
  const inCredit = cents <= 0
  return (
    <span className={`font-medium tabular-nums ${inCredit ? "text-emerald-600" : "text-red-600"}`}>
      {inCredit ? "CR " : ""}{formatZAR(Math.abs(cents))}
    </span>
  )
}

const TYPE_BADGE: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  payment: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  deposit: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  interest: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
}

export default async function TenantLedgerPage({
  params,
}: Readonly<{
  params: Promise<{ tenantId: string }>
}>) {
  const { tenantId } = await params

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) redirect("/login")

  const supabase = await createServiceClient()

  // Validate tenant exists and get basic info
  const { data: tenant } = await supabase
    .from("tenant_view")
    .select("id, org_id, first_name, last_name, company_name, entity_type, email")
    .eq("id", tenantId)
    .maybeSingle()

  if (!tenant) notFound()

  // Fetch all financial history in parallel
  const [invoicesRes, paymentsRes, depositsRes] = await Promise.all([
    supabase
      .from("rent_invoices")
      .select("id, invoice_number, due_date, total_amount_cents, period_from, period_to, status")
      .eq("tenant_id", tenantId)
      .eq("org_id", tenant.org_id)
      .order("due_date", { ascending: true }),

    supabase
      .from("payments")
      .select("id, payment_date, amount_cents, payment_method, reference, receipt_number")
      .eq("tenant_id", tenantId)
      .eq("org_id", tenant.org_id)
      .order("payment_date", { ascending: true }),

    supabase
      .from("deposit_transactions")
      .select("id, created_at, transaction_type, amount_cents, direction, description, reference")
      .eq("tenant_id", tenantId)
      .eq("org_id", tenant.org_id)
      .order("created_at", { ascending: true }),
  ])

  const invoices = invoicesRes.data ?? []
  const payments = paymentsRes.data ?? []
  const depositTxns = depositsRes.data ?? []

  const displayName = tenant.entity_type === "company"
    ? (tenant.company_name ?? "Tenant")
    : [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"

  // Build unified ledger
  const entries: LedgerEntry[] = [
    ...buildInvoiceEntries(invoices),
    ...buildPaymentEntries(payments),
    ...buildDepositEntries(depositTxns),
  ].sort((a, b) => a.date.localeCompare(b.date))

  // Compute running balance (debit = owed, credit = reduces)
  const rentEntries = entries.filter((e) => e.type === "invoice" || e.type === "payment")
  const rentWithBalance = rentEntries.reduce<Array<LedgerEntry & { runningBalance: number }>>(
    (acc, e) => {
      const prev = acc.length > 0 ? acc.at(-1)!.runningBalance : 0
      return [...acc, { ...e, runningBalance: prev + e.debitCents - e.creditCents }]
    },
    [],
  )

  // Deposit entries are separate from rent balance
  const depositEntries = entries.filter((e) => e.type === "deposit")
  const depositsWithBalance = depositEntries.reduce<Array<LedgerEntry & { depositBalance: number }>>(
    (acc, e) => {
      const prev = acc.length > 0 ? acc.at(-1)!.depositBalance : 0
      return [...acc, { ...e, depositBalance: prev + e.creditCents - e.debitCents }]
    },
    [],
  )
  const depositBalance = depositsWithBalance.at(-1)?.depositBalance ?? 0

  const totalInvoiced = invoices.reduce((s, i) => s + i.total_amount_cents, 0)
  const totalPaid = payments.reduce((s, p) => s + p.amount_cents, 0)
  const currentBalance = totalInvoiced - totalPaid

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={"/tenants/" + tenantId}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to {displayName}
          </Link>
          <h1 className="font-heading text-2xl">Tenant Ledger</h1>
          <p className="text-muted-foreground text-sm">{displayName}{tenant.email ? " · " + tenant.email : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" render={<Link href={`/api/tenants/${tenantId}/statement`} target="_blank" />}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Statement
          </Button>
          <PrintButton />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total invoiced", value: formatZAR(totalInvoiced), accent: false },
          { label: "Total paid", value: formatZAR(totalPaid), accent: false },
          { label: "Balance owing", value: formatZAR(currentBalance), accent: currentBalance > 0 },
          { label: "Deposit held", value: formatZAR(Math.max(0, depositBalance)), accent: false },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-1 font-heading text-xl tabular-nums ${accent ? "text-red-600" : ""}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Rent ledger */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Rent &amp; Payment History</h2>
        </div>
        {rentWithBalance.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">No rent history found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Debit</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Credit</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rentWithBalance.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={"text-[11px] px-2 py-0.5 rounded font-medium " + (TYPE_BADGE[entry.type] ?? "")}>
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="truncate max-w-[220px] block">{entry.description}</span>
                      {entry.ref && <span className="text-[11px] text-muted-foreground font-mono">{entry.ref}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {entry.debitCents > 0 ? <span className="text-foreground">{formatZAR(entry.debitCents)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {entry.creditCents > 0 ? <span className="text-emerald-600">{formatZAR(entry.creditCents)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <BalancePill cents={entry.runningBalance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deposit ledger */}
      {depositsWithBalance.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Deposit Activity</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Debit</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Credit</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Deposit Held</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {depositsWithBalance.map((entry) => (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(entry.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block">{entry.description}</span>
                      {entry.ref && <span className="text-[11px] text-muted-foreground font-mono">{entry.ref}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {entry.debitCents > 0 ? formatZAR(entry.debitCents) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {entry.creditCents > 0 ? <span className="text-emerald-600">{formatZAR(entry.creditCents)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatZAR(entry.depositBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
