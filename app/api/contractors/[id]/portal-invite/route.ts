import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { sendPortalInvite } from "@/lib/contractors/sendPortalInvite"

const PORTAL_TIERS = new Set(["portfolio", "firm"])

// POST /api/contractors/[id]/portal-invite
// Sends (or resends) a portal invite to the contractor.
// Requires Portfolio or Firm tier.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: contractorId } = await params
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

  if (!sub || !PORTAL_TIERS.has(sub.tier)) {
    return NextResponse.json(
      { error: "Contractor portal is available on Portfolio and Firm plans" },
      { status: 403 }
    )
  }

  // Verify contractor belongs to this org
  const { data: contractor } = await service
    .from("contractors")
    .select("id, portal_status")
    .eq("id", contractorId)
    .eq("org_id", membership.org_id)
    .single()

  if (!contractor) return NextResponse.json({ error: "Contractor not found" }, { status: 404 })

  if (contractor.portal_status === "active") {
    return NextResponse.json({ error: "Portal already active for this contractor" }, { status: 409 })
  }

  // For resend: reset portal_access_enabled so sendPortalInvite doesn't block it
  if (contractor.portal_status === "invited") {
    await service
      .from("contractors")
      .update({ portal_access_enabled: false })
      .eq("id", contractorId)
  }

  const result = await sendPortalInvite(contractorId, user.id)

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // Update portal_status
  await service
    .from("contractors")
    .update({ portal_status: "invited" })
    .eq("id", contractorId)

  return NextResponse.json({ ok: true, status: "invited" })
}
