import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { FileText } from "lucide-react"
import { formatZAR } from "@/lib/constants"

const STATUS_MAP: Record<string, "pending" | "completed" | "arrears" | "scheduled"> = {
  submitted: "pending",
  under_review: "pending",
  approved: "scheduled",
  pending_payment: "pending",
  paid: "completed",
  rejected: "arrears",
  owner_direct_recorded: "completed",
}

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data } = await supabase
    .from("supplier_invoices")
    .select("id, invoice_number, description, amount_incl_vat_cents, invoice_date, status, contractor_view(first_name, last_name, company_name), properties(name)")
    .order("invoice_date", { ascending: false })
    .limit(100)
  const list = data ?? []

  return (
    <div>
      {list.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-muted-foreground" />}
          title="No invoices"
          description="Supplier invoices will appear here once submitted."
        />
      ) : (
        <div className="space-y-2">
          {list.map((inv) => {
            const contractor = inv.contractor_view as unknown as { first_name?: string; last_name?: string; company_name?: string } | null
            const property = inv.properties as unknown as { name: string } | null
            const contractorName = contractor?.company_name ?? [contractor?.first_name, contractor?.last_name].filter(Boolean).join(" ") ?? "Unknown"
            return (
              <Link key={inv.id} href={`/payments/invoices/${inv.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <p className="font-medium">{contractorName}</p>
                      <p className="text-sm text-muted-foreground">
                        {inv.invoice_number && `${inv.invoice_number} · `}{property?.name ?? ""}
                        {inv.description ? ` · ${inv.description.slice(0, 60)}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{inv.invoice_date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-heading">{formatZAR(inv.amount_incl_vat_cents)}</span>
                      <StatusBadge status={STATUS_MAP[inv.status] ?? "pending"} />
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
