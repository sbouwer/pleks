import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { CreditCard, Plus } from "lucide-react"
import { formatZAR } from "@/lib/constants"

const STATUS_MAP: Record<string, "pending" | "active" | "completed" | "arrears"> = {
  submitted: "pending",
  under_review: "pending",
  approved: "active",
  pending_payment: "pending",
  paid: "completed",
  rejected: "arrears",
  disputed: "arrears",
  owner_direct_recorded: "completed",
}

export default async function PaymentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: invoices } = await supabase
    .from("supplier_invoices")
    .select("id, invoice_number, description, amount_incl_vat_cents, invoice_date, status, payment_source, contractor_view(first_name, last_name, company_name), properties(name)")
    .order("created_at", { ascending: false })
    .limit(50)

  const list = invoices || []
  const pendingReview = list.filter((i) => ["submitted", "under_review"].includes(i.status))
  const unpaid = list.filter((i) => ["approved", "pending_payment"].includes(i.status))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Payments & Invoices</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {pendingReview.length} pending review &middot; {unpaid.length} approved unpaid
            </p>
          )}
        </div>
        <Button render={<Link href="/payments/invoices/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Add Invoice
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<CreditCard className="h-8 w-8 text-muted-foreground" />} title="No invoices yet" description="Invoices from contractors and suppliers will appear here." />
      ) : (
        <div className="space-y-2">
          {list.map((inv) => {
            const contractor = inv.contractor_view as unknown as { first_name: string; last_name: string; company_name: string | null } | null
            const property = inv.properties as unknown as { name: string } | null

            return (
              <Link key={inv.id} href={`/payments/invoices/${inv.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{inv.description}</p>
                        {inv.invoice_number && (
                          <span className="text-xs text-muted-foreground">{inv.invoice_number}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {contractor ? contractor.company_name || `${contractor.first_name} ${contractor.last_name}`.trim() : "Unknown"}
                        {property ? ` · ${property.name}` : ""}
                        {` · ${inv.invoice_date}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-heading">{formatZAR(inv.amount_incl_vat_cents)}</span>
                      <StatusBadge status={STATUS_MAP[inv.status] || "pending"} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
