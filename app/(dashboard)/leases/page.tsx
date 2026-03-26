import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { FileText, Plus } from "lucide-react"
import { formatZAR } from "@/lib/constants"

const STATUS_MAP: Record<string, "active" | "pending" | "open" | "notice" | "cancelled" | "draft"> = {
  draft: "draft",
  pending_signing: "pending",
  active: "active",
  notice: "notice",
  expired: "cancelled",
  cancelled: "cancelled",
  month_to_month: "active",
}

export default async function LeasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: leases } = await supabase
    .from("leases")
    .select("id, status, lease_type, start_date, end_date, rent_amount_cents, tenants(first_name, last_name, company_name, tenant_type), units(unit_number, properties(name))")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  const list = leases || []
  const active = list.filter((l) => ["active", "month_to_month"].includes(l.status))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Leases</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {active.length} active &middot; {list.length} total
            </p>
          )}
        </div>
        <Button render={<Link href="/leases/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Create Lease
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8 text-muted-foreground" />}
          title="No leases yet"
          description="Create a lease to start managing tenancies."
          action={{ label: "Create Lease", onClick: () => {} }}
        />
      ) : (
        <div className="space-y-2">
          {list.map((lease) => {
            const tenant = lease.tenants as unknown as { first_name: string; last_name: string; company_name: string; tenant_type: string } | null
            const unit = lease.units as unknown as { unit_number: string; properties: { name: string } } | null
            const tenantName = tenant?.tenant_type === "company"
              ? tenant.company_name
              : `${tenant?.first_name || ""} ${tenant?.last_name || ""}`.trim()

            return (
              <Link key={lease.id} href={`/leases/${lease.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <p className="font-medium">{tenantName || "No tenant"}</p>
                      <p className="text-sm text-muted-foreground">
                        {unit ? `${unit.unit_number}, ${unit.properties.name}` : "No unit"}
                        {" · "}{formatZAR(lease.rent_amount_cents)}/mo
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lease.start_date}{lease.end_date ? ` → ${lease.end_date}` : " · Month to month"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs capitalize text-muted-foreground">{lease.lease_type}</span>
                      <StatusBadge status={STATUS_MAP[lease.status] || "draft"} />
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
