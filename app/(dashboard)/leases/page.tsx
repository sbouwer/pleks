import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { LeaseListTabs } from "./LeaseListTabs"
import type { SerializedLease } from "./LeaseRow"

export default async function LeasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  const orgId = membership?.org_id
  if (!orgId) redirect("/login")

  const { data: leases } = await supabase
    .from("leases")
    .select(`
      id, status, lease_type, start_date, end_date, rent_amount_cents,
      notice_period_days, is_fixed_term, cpa_applies,
      auto_renewal_notice_sent_at, debicheck_mandate_status,
      escalation_review_date, tenant_id,
      tenant_view(id, first_name, last_name, company_name, entity_type),
      units(unit_number, properties(name, suburb, city)),
      lease_co_tenants(tenant_id, tenants(id, contacts(first_name, last_name, company_name, entity_type)))
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  // Serialise for client component — cast to known shape
  const serialised: SerializedLease[] = (leases ?? []).map((l) => {
    const tv = l.tenant_view as unknown as {
      id: string; first_name: string | null; last_name: string | null
      company_name: string | null; entity_type: string
    } | null

    const unit = l.units as unknown as {
      unit_number: string
      properties: { name: string; suburb: string | null; city: string | null }
    } | null

    const coTenants = (l.lease_co_tenants as unknown as Array<{
      tenant_id: string
      tenants: {
        id: string
        contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null
      } | null
    }>) ?? []

    return {
      id: l.id,
      status: l.status,
      lease_type: l.lease_type,
      start_date: l.start_date ?? null,
      end_date: l.end_date ?? null,
      rent_amount_cents: l.rent_amount_cents ?? 0,
      notice_period_days: l.notice_period_days ?? 20,
      is_fixed_term: l.is_fixed_term ?? false,
      cpa_applies: l.cpa_applies ?? false,
      auto_renewal_notice_sent_at: l.auto_renewal_notice_sent_at ?? null,
      debicheck_mandate_status: l.debicheck_mandate_status ?? null,
      escalation_review_date: l.escalation_review_date ?? null,
      tenant_id: l.tenant_id,
      tenant_view: tv,
      units: unit,
      lease_co_tenants: coTenants,
    }
  })

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Leases</h1>
          <p className="text-sm text-muted-foreground">
            Manage tenancy agreements and rental schedules.
          </p>
        </div>
        <Button render={<Link href="/leases/new" />}>
          <Plus className="mr-1 h-4 w-4" /> Create Lease
        </Button>
      </div>

      <LeaseListTabs leases={serialised} />
    </div>
  )
}
