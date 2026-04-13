import { redirect } from "next/navigation"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { CheckCircle2, AlertTriangle, Building2, Download } from "lucide-react"
import Link from "next/link"

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
      .single(),
    // Full payment history
    service.from("payments")
      .select("id, payment_date, amount_cents, payment_method, reference, description")
      .eq("lease_id", leaseId)
      .eq("org_id", orgId)
      .order("payment_date", { ascending: false })
      .limit(50),
    // Trust bank account for EFT details
    service.from("bank_accounts")
      .select("bank_name, account_number, branch_code, account_type, account_holder")
      .eq("org_id", orgId)
      .eq("type", "trust")
      .is("deleted_at", null)
      .limit(1)
      .single(),
  ])

  const invoice = invoiceRes.data
  const payments = paymentsRes.data ?? []
  const bank = bankRes.data

  return (
    <div>
      <h1 className="font-heading text-3xl mb-6">Payments</h1>

      {/* Current balance + EFT details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-border/60 bg-card px-5 py-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Current balance</p>
          {invoice ? (
            <>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${invoice.status === "overdue" ? "text-danger" : "text-warning"}`} />
                <p className={`text-2xl font-heading ${invoice.status === "overdue" ? "text-danger" : ""}`}>
                  {formatZAR(invoice.balance_cents ?? 0)}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Due: {new Date(invoice.due_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              {invoice.payment_reference && (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Use this reference for EFT</p>
                  <p className="text-sm font-mono font-semibold">{invoice.payment_reference}</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-medium">Account clear — no amounts due</p>
            </div>
          )}
        </div>

        {bank && (
          <div className="rounded-xl border border-border/60 bg-card px-5 py-5 space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <Building2 className="h-3.5 w-3.5" />
              EFT banking details
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-medium">{bank.bank_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account holder</span>
                <span>{bank.account_holder}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account number</span>
                <span className="font-mono">{bank.account_number}</span>
              </div>
              {bank.branch_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Branch code</span>
                  <span className="font-mono">{bank.branch_code}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account type</span>
                <span className="capitalize">{bank.account_type}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment history */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
          <p className="text-sm font-semibold">Payment history</p>
          <Link
            href={`/api/portal/statement`}
            target="_blank"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3 w-3" /> Download statement
          </Link>
        </div>
        {payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No payment records yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {p.description ?? "Rental payment"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.payment_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    {p.payment_method && ` · ${p.payment_method.replaceAll("_", " ")}`}
                    {p.reference && ` · Ref: ${p.reference}`}
                  </p>
                </div>
                <p className="text-sm font-semibold text-success">{formatZAR(p.amount_cents)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
