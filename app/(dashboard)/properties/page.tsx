import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { getAttentionItems } from "@/lib/dashboard/attentionItems"
import { getActivityFeed } from "@/lib/dashboard/activityFeed"
import { SinglePropertyView, NoPropertyYet } from "@/components/properties/SinglePropertyView"
import { PropertyCards } from "@/components/properties/PropertyCards"
import { PropertyListView } from "@/components/properties/PropertyListView"
import type { SinglePropertyData } from "@/components/properties/SinglePropertyView"
import type { PropertyListItem } from "@/components/properties/PropertyList"

export default async function PropertiesPage({
  searchParams,
}: Readonly<{
  searchParams: Record<string, string>
}>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const tier = await getOrgTier(orgId)
  const supabase = await createClient()

  // ── Owner tier: single property dashboard ──────────────────────────────────
  if (tier === "owner") {
    const { data: rawProperty } = await supabase
      .from("properties")
      .select(`
        id, name, type, address_line1, address_line2, suburb, city, province, postal_code,
        units(
          id, unit_number, status, is_archived,
          leases(
            id, status, rent_amount_cents, start_date, end_date,
            tenant:tenants!tenant_id(id, contact:contacts(first_name, last_name))
          )
        )
      `)
      .is("deleted_at", null)
      .maybeSingle()

    if (!rawProperty) return <NoPropertyYet />

    const [attentionItems, activityItems] = await Promise.all([
      getAttentionItems(orgId),
      getActivityFeed(orgId),
    ])

    const property = rawProperty as unknown as SinglePropertyData

    return (
      <SinglePropertyView
        property={property}
        attentionItems={attentionItems}
        recentActivity={activityItems}
      />
    )
  }

  // ── Steward tier: enriched card grid ──────────────────────────────────────
  if (tier === "steward") {
    const { data: rawProperties } = await supabase
      .from("properties")
      .select(`
        id, name, type, address_line1, city, province,
        units(id, status, is_archived, leases(id, status, rent_amount_cents))
      `)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    const properties = (rawProperties ?? []) as unknown as PropertyListItem[]
    const totalUnitCount = properties.reduce(
      (sum, p) => sum + p.units.filter(u => !u.is_archived).length, 0
    )

    return <PropertyCards properties={properties} tier={tier} totalUnitCount={totalUnitCount} />
  }

  // ── Portfolio / Firm tier: filterable list ────────────────────────────────
  const q = searchParams.q?.toLowerCase() ?? ""
  const statusFilter = searchParams.status ?? ""
  const view = (searchParams.view ?? "list") as "list" | "cards"

  const { data: rawProperties } = await supabase
    .from("properties")
    .select(`
      id, name, type, address_line1, city, province,
      units(id, status, is_archived, leases(id, status, rent_amount_cents))
    `)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  let properties = (rawProperties ?? []) as unknown as PropertyListItem[]

  // Apply search filter (server-side on the fetched data)
  if (q) {
    properties = properties.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.address_line1.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q)
    )
  }

  // Apply status filter
  if (statusFilter === "vacancies") {
    properties = properties.filter(p =>
      p.units.some(u => !u.is_archived && u.status !== "occupied")
    )
  } else if (statusFilter === "occupied") {
    properties = properties.filter(p => {
      const active = p.units.filter(u => !u.is_archived)
      return active.length > 0 && active.every(u => u.status === "occupied")
    })
  }

  const totalUnitCount = properties.reduce(
    (sum, p) => sum + p.units.filter(u => !u.is_archived).length, 0
  )

  return (
    <PropertyListView
      properties={properties}
      view={view}
      tier={tier}
      totalUnitCount={totalUnitCount}
    />
  )
}
