import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { waiveArrearsInterest } from "@/lib/finance/arrearsInterest"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id, role, is_admin")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const row = membership as unknown as { org_id: string; role: string; is_admin: boolean }
  const isAdmin = row.role === "owner" || row.is_admin === true
  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required to waive interest" }, { status: 403 })
  }

  const { reason } = await req.json()

  if (!reason || typeof reason !== "string") {
    return NextResponse.json({ error: "Reason required" }, { status: 400 })
  }

  const result = await waiveArrearsInterest(caseId, user.id, reason.trim())

  return NextResponse.json({
    ok: true,
    waivedCents: result.waivedCents,
    chargesWaived: result.chargesWaived,
  })
}
