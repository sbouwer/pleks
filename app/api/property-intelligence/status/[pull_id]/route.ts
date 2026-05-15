/**
 * app/api/property-intelligence/status/[pull_id]/route.ts — Poll pull status for adhoc charge flow
 *
 * Route:  GET /api/property-intelligence/status/[pull_id]
 * Auth:   gateway() — org membership checked via org_id on pull row
 * Data:   property_intelligence_pulls (read)
 * Notes:  ADDENDUM_14A. Used by PropertyVerificationCard and LandlordVerificationCard to poll
 *         after a 1-click adhoc charge while waiting for vendor execution.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pull_id: string }> },
) {
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { pull_id: pullId } = await params

  const { data: pull, error } = await db
    .from("property_intelligence_pulls")
    .select("id, product_type, status, completed_at, extracted_facts_jsonb, subject_label, pdf_storage_path")
    .eq("id", pullId)
    .eq("org_id", orgId)
    .single()

  if (error || !pull) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ status: pull.status, pull })
}
