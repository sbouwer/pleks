/**
 * app/(supplier)/supplier/invoices/page.tsx — Supplier invoices list + totals
 *
 * Route:  /supplier/invoices
 * Auth:   getSupplierSession (Supabase-auth contractor — ADDENDUM_00M)
 * Data:   supplier_invoices via service, scoped to session.contractorId
 * Notes:  Canon ResourcePageHeader + DetailCard (door style) — presentation only.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { formatZAR } from "@/lib/constants"
import { getSupplierSession } from "@/lib/portal/getSupplierSession"
import { logQueryError } from "@/lib/supabase/logQueryError"

function invTone(s: string): string {
  if (s === "paid") return "border-success/30 bg-success/10 text-success"
  if (s === "approved") return "border-info/30 bg-info/10 text-info"
  if (s === "pending") return "border-warning/30 bg-warning/10 text-warning"
  return "border-border bg-muted text-muted-foreground"
}

export default async function ContractorInvoicesPage() {
  const session = await getSupplierSession()
  if (!session) redirect("/login?role=supplier")

  const service = await createServiceClient()

  const { data: invoices, error: invoicesError } = await service
    .from("supplier_invoices")
    .select(`
      id, invoice_number, amount_incl_vat_cents, status, invoice_date,
      maintenance_requests(title, work_order_number)
    `)
    .eq("contractor_id", session.contractorId)
    .order("invoice_date", { ascending: false })
    logQueryError("ContractorInvoicesPage supplier_invoices", invoicesError)

  const allInvoices = invoices ?? []
  const totalInvoiced = allInvoices.reduce((s, i) => s + (i.amount_incl_vat_cents ?? 0), 0)
  const totalPaid = allInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount_incl_vat_cents ?? 0), 0)
  const pendingAmount = totalInvoiced - totalPaid

  return (
    <div className="space-y-4">
      <ResourcePageHeader eyebrow="Supplier" title="Invoices" headline={`${allInvoices.length} invoice${allInvoices.length === 1 ? "" : "s"}`} />

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[var(--r-button)] border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total invoiced</p>
          <p className="font-heading text-lg text-foreground">{formatZAR(totalInvoiced)}</p>
        </div>
        <div className="rounded-[var(--r-button)] border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="font-heading text-lg text-success">{formatZAR(totalPaid)}</p>
        </div>
        <div className="rounded-[var(--r-button)] border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="font-heading text-lg text-warning">{formatZAR(pendingAmount)}</p>
        </div>
      </div>

      {allInvoices.length === 0 ? (
        <DetailCard title="All invoices">
          <p className="py-4 text-center text-sm text-muted-foreground">No invoices submitted yet.</p>
        </DetailCard>
      ) : (
        <DetailCard title="All invoices">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-2 text-left">Invoice</th>
                  <th className="py-2 pr-2 text-left">Job</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="py-2 text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {allInvoices.map((inv) => {
                  const req = inv.maintenance_requests as unknown as { title: string; work_order_number: string } | null
                  return (
                    <tr key={inv.id} className="border-b border-border">
                      <td className="py-2 pr-2 font-mono text-xs text-foreground">{inv.invoice_number}</td>
                      <td className="py-2 pr-2 text-xs text-foreground">{req?.title ?? req?.work_order_number ?? "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold text-foreground">{formatZAR(inv.amount_incl_vat_cents)}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-[var(--r-button)] border px-2 py-0.5 text-xs capitalize ${invTone(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{new Date(inv.invoice_date).toLocaleDateString("en-ZA")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </DetailCard>
      )}
    </div>
  )
}
