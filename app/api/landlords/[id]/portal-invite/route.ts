import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { inviteLandlord } from "@/lib/portal/inviteLandlord"

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

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  // Tier check
  const { data: sub } = await service
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    .single()

  if (!PORTAL_TIERS.has(sub?.tier ?? "")) {
    return NextResponse.json({ error: "Landlord portal requires Portfolio or Firm plan" }, { status: 403 })
  }

  // Verify landlord belongs to this org
  const { data: landlord } = await service
    .from("landlords")
    .select("id, org_id, portal_status")
    .eq("id", landlordId)
    .eq("org_id", membership.org_id)
    .single()

  if (!landlord) return NextResponse.json({ error: "Landlord not found" }, { status: 404 })

  // For resend: reset portal_status to 'none' so inviteLandlord allows it
  if (landlord.portal_status === "invited") {
    await service.from("landlords").update({ portal_status: "none" }).eq("id", landlordId)
  }

  const result = await inviteLandlord(landlordId, user.id)
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

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { error } = await service.from("landlords").update({
    portal_status: "suspended",
  }).eq("id", landlordId).eq("org_id", membership.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: "suspended" })
}
