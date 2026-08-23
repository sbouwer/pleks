/**
 * app/api/landlords/[id]/portal-invite/route.ts — invite/resend or suspend a landlord's portal access
 *
 * Route:  POST, DELETE /api/landlords/[id]/portal-invite
 * Auth:   auth.getUser() + user_orgs membership; org must be on Portfolio or Firm tier
 * Data:   reads subscriptions + landlords; POST calls inviteLandlord; DELETE sets portal_status 'suspended'
 * Notes:  a resend (portal_status 'invited') is reset to 'none' first so inviteLandlord re-fires
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { inviteLandlord } from "@/lib/portal/inviteLandlord"
import { logQueryError } from "@/lib/supabase/logQueryError"

const PORTAL_TIERS = new Set(["portfolio", "firm"])

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: landlordId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("POST user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  // Tier check
  const { data: sub, error: subError } = await service
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    // Purged rows are history; org_id has an INDEX, not a unique constraint
    // (001_foundation.sql:265). Without this, a purged-then-resubscribed org has two rows,
    // `.single()` errors, and a paying Firm org is told it needs a Portfolio or Firm plan.
    .not("status", "eq", "purged")
    .maybeSingle()
    logQueryError("POST subscriptions", subError)

  // "Could not read the tier" is not "the tier is too low" — say the true thing.
  if (subError) {
    return NextResponse.json({ error: "Could not read subscription" }, { status: 503 })
  }
  if (!PORTAL_TIERS.has(sub?.tier ?? "")) {
    return NextResponse.json({ error: "Landlord portal requires Portfolio or Firm plan" }, { status: 403 })
  }

  // Verify landlord belongs to this org
  const { data: landlord, error: landlordError } = await service
    .from("landlords")
    .select("id, org_id, portal_status")
    .eq("id", landlordId)
    .eq("org_id", membership.org_id)
    .single()
    logQueryError("POST landlords", landlordError)

  if (!landlord) return NextResponse.json({ error: "Landlord not found" }, { status: 404 })

  // For resend: reset portal_status to 'none' so inviteLandlord allows it
  if (landlord.portal_status === "invited") {
    await service.from("landlords").update({ portal_status: "none" }).eq("id", landlordId)
  }

  const result = await inviteLandlord(landlordId, user.id, membership.org_id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  return NextResponse.json({ ok: true, status: "invited" })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: landlordId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("DELETE user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { error } = await service.from("landlords").update({
    portal_status: "suspended",
  }).eq("id", landlordId).eq("org_id", membership.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: "suspended" })
}
