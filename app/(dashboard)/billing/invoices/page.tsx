/**
 * app/(dashboard)/billing/invoices/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
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

interface Props { searchParams: Promise<{ contractor?: string }> }

export default async function InvoicesPage({ searchParams }: Readonly<Props>) {
  const contractorFilter = (await searchParams).contractor ?? null
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  let query = db
    .from("supplier_invoices")
    .select("id, invoice_number, description, amount_incl_vat_cents, invoice_date, status, contractor_view(first_name, last_name, company_name), properties(name)")
    .eq("org_id", orgId)
  if (contractorFilter) query = query.eq("contractor_id", contractorFilter)
  const { data, error } = await query.order("invoice_date", { ascending: false }).limit(100)

  if (error) console.error("fetchInvoices failed:", error.message)
  const list = data ?? []
  const firstContractor = list[0]?.contractor_view as unknown as { first_name?: string; last_name?: string; company_name?: string } | null
  const personName = [firstContractor?.first_name, firstContractor?.last_name].filter(Boolean).join(" ")
  const filterName = contractorFilter ? (firstContractor?.company_name ?? (personName || "this supplier")) : null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Supplier Invoices</h1>
          <p className="text-sm text-muted-foreground">{list.length} invoice{list.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {contractorFilter && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered to {filterName}</span>
          <Link href="/billing/invoices" className="text-brand hover:underline">Show all</Link>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-muted-foreground" />}
          title="No invoices yet"
          description="Supplier invoices will appear here once submitted by contractors or added manually."
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
