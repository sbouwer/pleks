import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { AlertTriangle } from "lucide-react"
import { formatZAR } from "@/lib/constants"

const STATUS_MAP: Record<string, "arrears" | "pending" | "active" | "completed"> = {
  open: "arrears",
  payment_arrangement: "pending",
  legal: "arrears",
  tribunal: "arrears",
  eviction_notice: "arrears",
  resolved: "completed",
  written_off: "completed",
  vacated_with_debt: "completed",
}

export default async function ArrearsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: cases } = await supabase
    .from("arrears_cases")
    .select("id, status, total_arrears_cents, months_in_arrears, current_step, lease_type, tenant_view(first_name, last_name, company_name, entity_type), units(unit_number, properties(name))")
    .order("total_arrears_cents", { ascending: false })

  const list = cases || []
  const openCases = list.filter((c) => ["open", "payment_arrangement", "legal"].includes(c.status))
  const totalArrears = openCases.reduce((sum, c) => sum + c.total_arrears_cents, 0)

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Open Cases</p><p className="font-heading text-2xl">{openCases.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Arrears</p><p className="font-heading text-2xl text-danger">{formatZAR(totalArrears)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Arrangements</p><p className="font-heading text-2xl">{list.filter((c) => c.status === "payment_arrangement").length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Resolved</p><p className="font-heading text-2xl text-success">{list.filter((c) => c.status === "resolved").length}</p></CardContent></Card>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<AlertTriangle className="h-8 w-8 text-muted-foreground" />} title="No arrears cases" description="Arrears cases are created automatically when invoices become overdue." />
      ) : (
        <div className="space-y-2">
          {list.map((arrearsCase) => {
            const tenant = arrearsCase.tenant_view as unknown as { first_name: string; last_name: string; company_name: string; entity_type: string } | null
            const unit = arrearsCase.units as unknown as { unit_number: string; properties: { name: string } } | null
            const tenantName = tenant?.entity_type === "organisation"
              ? tenant.company_name
              : `${tenant?.first_name || ""} ${tenant?.last_name || ""}`.trim()

            return (
              <Link key={arrearsCase.id} href={`/payments/arrears/${arrearsCase.id}`}>
                <Card className={`hover:border-brand/50 transition-colors cursor-pointer ${arrearsCase.status === "open" ? "border-danger/20" : ""}`}>
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <p className="font-medium">{tenantName || "—"}</p>
                      <p className="text-sm text-muted-foreground">
                        {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
                        {` · ${arrearsCase.months_in_arrears} month${arrearsCase.months_in_arrears !== 1 ? "s" : ""}`}
                        {` · Step ${arrearsCase.current_step}`}
                        {` · ${arrearsCase.lease_type}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-heading text-danger">{formatZAR(arrearsCase.total_arrears_cents)}</span>
                      <StatusBadge status={STATUS_MAP[arrearsCase.status] || "arrears"} />
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
