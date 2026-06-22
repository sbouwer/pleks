/**
 * app/(dashboard)/listings/page.tsx — server entry for the rental listings list
 *
 * Route:  /listings
 * Auth:   getServerOrgMembership (dashboard gateway) — redirects to /login if no membership
 * Data:   listings (active/paused/filled/expired) + a single aggregate count of SUBMITTED applications per
 *         listing (stage1_consent_given = true; drafts excluded). Responsible agent (unit.assigned_agent_id ??
 *         property.managing_agent_id) drives the client's "My work = my listings" filter.
 * Notes:  Level 1 of the drill-down — a listing opens its submitted applications at /listings/[slug].
 */
import { redirect } from "next/navigation"
import { getServerOrgMembership } from "@/lib/auth/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { ListingsPageClient, type ListingListRow } from "./ListingsPageClient"

interface ListingJoin {
  id: string
  public_slug: string | null
  asking_rent_cents: number
  status: string
  closes_at: string | null
  created_at: string
  units: { unit_number: string | null; assigned_agent_id: string | null; properties: { name: string | null; managing_agent_id: string | null } | null } | null
}

export default async function ListingsPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")
  const { org_id: orgId } = membership
  const supabase = await createServiceClient()

  const [listingsResult, submittedResult] = await Promise.all([
    supabase
      .from("listings")
      .select("id, public_slug, asking_rent_cents, status, closes_at, created_at, units(unit_number, assigned_agent_id, properties(name, managing_agent_id))")
      .eq("org_id", orgId)
      .in("status", ["active", "paused", "filled", "expired"])
      .order("created_at", { ascending: false }),
    // One aggregate pass: every SUBMITTED application's listing_id (drafts excluded) → tally per listing in JS.
    supabase
      .from("applications")
      .select("listing_id")
      .eq("org_id", orgId)
      .eq("stage1_consent_given", true),
  ])
  logQueryError("ListingsPage listings", listingsResult.error)
  logQueryError("ListingsPage submitted counts", submittedResult.error)

  const counts = new Map<string, number>()
  for (const row of submittedResult.data ?? []) {
    const lid = (row as { listing_id: string | null }).listing_id
    if (lid) counts.set(lid, (counts.get(lid) ?? 0) + 1)
  }

  const listings: ListingListRow[] = ((listingsResult.data ?? []) as unknown as ListingJoin[]).map((l) => {
    const unit = l.units
    const prop = unit?.properties
    return {
      id: l.id,
      slug: l.public_slug,
      unitNumber: unit?.unit_number ?? "—",
      propertyName: prop?.name ?? "—",
      askingRentCents: l.asking_rent_cents,
      status: l.status,
      closesAt: l.closes_at,
      createdAt: l.created_at,
      responsibleAgentId: unit?.assigned_agent_id ?? prop?.managing_agent_id ?? null,
      submittedCount: counts.get(l.id) ?? 0,
    }
  })

  return <ListingsPageClient listings={listings} />
}
