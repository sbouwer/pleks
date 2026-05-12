/**
 * app/api/warranties/[id]/archive/route.ts — Soft-archive a warranty record
 *
 * Route:  PATCH /api/warranties/[id]/archive
 * Auth:   requireAgentWriteAccess (subscription-gated)
 * Data:   warranties (update archived_at)
 * Notes:  No DELETE policy exists on warranties — soft-archive only (D-60B-14)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const gw = await requireAgentWriteAccess("archive_warranty")
    const { db, orgId } = gw

    const { error } = await db
      .from("warranties")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId)
      .is("archived_at", null)

    if (error) {
      console.error("[warranties/archive] update failed:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: "Subscription inactive" }, { status: 403 })
    }
    throw err
  }
}
