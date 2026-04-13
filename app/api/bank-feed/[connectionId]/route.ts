/**
 * DELETE /api/bank-feed/[connectionId]
 * Disconnect a bank feed — marks as disconnected and removes from Yodlee.
 */

import { NextRequest } from "next/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { yodlee } from "@/lib/yodlee/client"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params
  const gw = await gatewaySSR()
  if (!gw) return Response.json({ error: "Not authenticated" }, { status: 401 })
  const { db, orgId, userId } = gw

  const { data: conn, error: connErr } = await db
    .from("bank_feed_connections")
    .select("yodlee_provider_account_id, org_id")
    .eq("id", connectionId)
    .eq("org_id", orgId)
    .single()

  if (connErr || !conn) return Response.json({ error: "Not found" }, { status: 404 })

  // Mark as disconnected in DB first (so even if Yodlee call fails, we're clean)
  await db.from("bank_feed_connections").update({
    status: "disconnected",
    billing_active: false,
    disconnected_at: new Date().toISOString(),
  }).eq("id", connectionId)

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "bank_feed_connections",
    record_id: connectionId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { status: "disconnected" },
  })

  // Best-effort: remove from Yodlee
  try {
    const { data: org } = await db
      .from("organisations")
      .select("yodlee_user_id")
      .eq("id", orgId)
      .single()

    if (org?.yodlee_user_id) {
      const cobrandToken = await yodlee.getCobrandToken()
      const userToken = await yodlee.getUserToken(cobrandToken, org.yodlee_user_id as string)
      await yodlee.deleteAccount(userToken, conn.yodlee_provider_account_id as string)
    }
  } catch (err) {
    console.error("Yodlee deleteAccount error (non-fatal):", err)
  }

  return Response.json({ success: true })
}
