/**
 * app/(tenant)/tenant/payments/page.tsx — tenant portal: rent account (balance, EFT details, payment history)
 *
 * Route:  /tenant/payments
 * Auth:   getTenantSession (redirects to /login); scoped to the lease + org
 * Data:   rent_invoices (latest open), payments (history), bank_accounts (trust) via the service client
 * Notes:  Hybrid overview (summary cards + history list) — canon ResourcePageHeader + DetailCard. Not a pure
 *         list/detail page, so it keeps a bespoke body adopting the canon primitives. Presentation only.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { CheckCircle2, AlertTriangle, Download } from "lucide-react"
import { fmtDateLongZA, fmtDateZA } from "@/lib/dates"

function fmtDate(d: string): string {
  return fmtDateLongZA(d)
}

function Row({ label, value, mono }: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "text-right font-mono text-foreground" : "text-right font-medium text-foreground"}>{value}</span>
    </div>
  )
}

export default async function PortalPaymentsPage() {
  const session = await getTenantSession()
  if (!session) redirect("/login")

  const service = await createServiceClient()
  const { leaseId, orgId } = session

  const [invoiceRes, paymentsRes, bankRes] = await Promise.all([
    // Latest open/overdue invoice
    service.from("rent_invoices")
      .select("id, due_date, total_amount_cents, balance_cents, payment_reference, status")
      .eq("lease_id", leaseId)
      .eq("org_id", orgId)
      .in("status", ["open", "partial", "overdue"])
      .order("due_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // Full payment history
    service.from("payments")
      .select("id, payment_date, amount_cents, payment_method, reference")
      .eq("lease_id", leaseId)
      .eq("org_id", orgId)
      .order("payment_date", { ascending: false })
      .limit(50),
    // Trust bank account for EFT details
    service.from("bank_accounts")
      .select("bank_name, account_number, branch_code, account_type, account_holder")
      .eq("org_id", orgId)
      .eq("type", "trust")
      .limit(1)
      .maybeSingle(),
  ])

  const invoice = invoiceRes.data
  const payments = paymentsRes.data ?? []
  const bank = bankRes.data

  const headline = invoice ? `${formatZAR(invoice.balance_cents ?? 0)} due` : "Account clear — no amounts due"

  return (
    <div>
      <ResourcePageHeader
        eyebrow="Tenant"
        title="Payments"
        headline={headline}
        sub="Your rent account, EFT details and payment history."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DetailCard title="Current balance">
          {invoice ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className={invoice.status === "overdue" ? "h-5 w-5 shrink-0 text-destructive" : "h-5 w-5 shrink-0 text-warning"} />
                <p className={invoice.status === "overdue" ? "font-heading text-2xl text-destructive" : "font-heading text-2xl text-foreground"}>
                  {formatZAR(invoice.balance_cents ?? 0)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">Due: {fmtDate(invoice.due_date)}</p>
              {invoice.payment_reference && (
                <div className="rounded-[var(--r-button)] bg-muted/50 px-3 py-2">
                  <p className="mb-0.5 text-xs text-muted-foreground">Use this reference for EFT</p>
                  <p className="font-mono text-sm font-semibold text-foreground">{invoice.payment_reference}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">Account clear — no amounts due</p>
            </div>
          )}
        </DetailCard>

        {bank && (
          <DetailCard title="EFT banking details">
            <div className="space-y-1.5 text-sm">
              <Row label="Bank" value={bank.bank_name} />
              <Row label="Account holder" value={bank.account_holder} />
              <Row label="Account number" value={bank.account_number} mono />
              {bank.branch_code && <Row label="Branch code" value={bank.branch_code} mono />}
              <Row label="Account type" value={bank.account_type} />
            </div>
          </DetailCard>
        )}
      </div>

      <div className="mt-4">
        <DetailCard
          title="Payment history"
          flush
          headerAction={
            <Link
              href="/api/portal/statement"
              target="_blank"
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Download className="h-3 w-3" /> Download statement
            </Link>
          }
        >
          {payments.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payment records yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.reference ?? "Rental payment"}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDateZA(p.payment_date)}
                      {p.payment_method && ` · ${p.payment_method.replaceAll("_", " ")}`}
                      {p.reference && ` · Ref: ${p.reference}`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-success">{formatZAR(p.amount_cents)}</p>
                </div>
              ))}
            </div>
          )}
        </DetailCard>
      </div>
    </div>
  )
}
