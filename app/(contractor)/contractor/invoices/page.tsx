import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatZAR } from "@/lib/constants"

export default async function ContractorInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: contractors } = await supabase
    .from("contractor_view")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("portal_access_enabled", true)

  const contractorIds = (contractors ?? []).map((c) => c.id)

  const { data: invoices } = await supabase
    .from("supplier_invoices")
    .select(`
      id, invoice_number, amount_incl_vat_cents, status, invoice_date,
      maintenance_requests(title, work_order_number)
    `)
    .in("contractor_id", contractorIds)
    .order("invoice_date", { ascending: false })

  const allInvoices = invoices ?? []
  const totalInvoiced = allInvoices.reduce((s, i) => s + (i.amount_incl_vat_cents ?? 0), 0)
  const totalPaid = allInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount_incl_vat_cents ?? 0), 0)
  const pendingAmount = totalInvoiced - totalPaid

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700",
    paid: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-gray-100 text-gray-700",
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Invoices</h1>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Total invoiced</p>
            <p className="font-heading text-lg">{formatZAR(totalInvoiced)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="font-heading text-lg text-emerald-600">{formatZAR(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="font-heading text-lg text-amber-600">{formatZAR(pendingAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {allInvoices.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">No invoices submitted yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-sm">All Invoices</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Invoice</th>
                  <th className="text-left py-2 pr-2">Job</th>
                  <th className="text-right py-2 px-2">Amount</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {allInvoices.map((inv) => {
                  const req = inv.maintenance_requests as unknown as { title: string; work_order_number: string } | null
                  return (
                    <tr key={inv.id} className="border-b border-border/50">
                      <td className="py-2 pr-2 font-mono text-xs">{inv.invoice_number}</td>
                      <td className="py-2 pr-2 text-xs">{req?.title ?? req?.work_order_number ?? "—"}</td>
                      <td className="text-right py-2 px-2 font-semibold">{formatZAR(inv.amount_incl_vat_cents)}</td>
                      <td className="py-2 px-2">
                        <Badge className={statusColors[inv.status] ?? ""} variant="secondary">
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="py-2 text-xs">{new Date(inv.invoice_date).toLocaleDateString("en-ZA")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
