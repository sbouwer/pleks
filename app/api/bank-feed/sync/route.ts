/**
 * POST /api/bank-feed/sync
 * On-demand sync for a single bank feed connection.
 * Rate-limited to 4 syncs/hour per connection.
 */

import { NextRequest } from "next/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { yodlee } from "@/lib/yodlee/client"
import { transformYodleeTransaction } from "@/lib/yodlee/transform"
import { syncYodleeTransactions } from "@/lib/actions/recon"

const RATE_LIMIT_HOURS = 1
const MAX_SYNCS_PER_WINDOW = 4

export async function POST(req: NextRequest) {
  const gw = await gatewaySSR()
  if (!gw) return Response.json({ error: "Not authenticated" }, { status: 401 })
  const { db, orgId } = gw

  const { connectionId } = (await req.json()) as { connectionId: string }
  if (!connectionId) return Response.json({ error: "Missing connectionId" }, { status: 400 })

  const { data: conn, error: connErr } = await db
    .from("bank_feed_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("org_id", orgId)
    .single()

  if (connErr || !conn) return Response.json({ error: "Connection not found" }, { status: 404 })
  if (conn.status === "disconnected") return Response.json({ error: "Connection is disconnected" }, { status: 400 })

  // Rate limit check
  if (conn.next_sync_after && new Date(conn.next_sync_after as string) > new Date()) {
    return Response.json({ error: "Rate limit — too many syncs. Try again later." }, { status: 429 })
  }

  const { data: org } = await db
    .from("organisations")
    .select("yodlee_user_id")
    .eq("id", orgId)
    .single()

  if (!org?.yodlee_user_id) return Response.json({ error: "No Yodlee user" }, { status: 400 })

  try {
    const cobrandToken = await yodlee.getCobrandToken()
    const userToken = await yodlee.getUserToken(cobrandToken, org.yodlee_user_id as string)

    const fromDate = conn.last_synced_at
      ? new Date(conn.last_synced_at as string).toISOString().slice(0, 10)
      : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) // 30 days back on first sync

    const toDate = new Date().toISOString().slice(0, 10)

    const rawTxns = await yodlee.getTransactions(
      userToken,
      conn.yodlee_account_id as string,
      fromDate,
      toDate,
    )

    const transactions = rawTxns.map(transformYodleeTransaction)

    const bankAccountId = conn.bank_account_id as string | null ?? ""
    const result = await syncYodleeTransactions(orgId, connectionId, bankAccountId, transactions, db)

    if (result.error) return Response.json({ error: result.error }, { status: 500 })

    // Set next_sync_after to enforce rate limit (window / max = 15 min apart)
    const windowMs = (RATE_LIMIT_HOURS * 60 * 60 * 1000) / MAX_SYNCS_PER_WINDOW
    await db.from("bank_feed_connections").update({
      next_sync_after: new Date(Date.now() + windowMs).toISOString(),
    }).eq("id", connectionId)

    return Response.json({ success: true, inserted: result.inserted, matched: result.matched })
  } catch (err) {
    console.error("Bank feed sync error:", err)
    await db.from("bank_feed_connections").update({
      status: "error",
      last_sync_status: "error",
      last_sync_error: String(err),
    }).eq("id", connectionId)
    return Response.json({ error: "Sync failed" }, { status: 502 })
  }
}
