import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
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
