/**
 * GET /api/cron/bank-feed-sync
 * Daily sync cron — runs at 06:00 SAST (04:00 UTC).
 * Fetches new transactions for all active Yodlee connections and auto-matches.
 */

import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { yodlee } from "@/lib/yodlee/client"
import { transformYodleeTransaction } from "@/lib/yodlee/transform"
import { syncYodleeTransactions } from "@/lib/actions/recon"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = await createServiceClient()
  const now = new Date()
  const toDate = now.toISOString().slice(0, 10)

  const { data: connections, error } = await db
    .from("bank_feed_connections")
    .select("id, org_id, bank_account_id, yodlee_provider_account_id, yodlee_account_id, last_synced_at, next_sync_after, organisations(yodlee_user_id)")
    .eq("status", "active")
    .eq("billing_active", true)

  if (error) {
    console.error("bank-feed-sync: fetch connections failed:", error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{ connectionId: string; inserted: number; matched: number; error?: string }> = []

  for (const conn of connections ?? []) {
    const connectionId = conn.id as string
    const orgId = conn.org_id as string

    // Skip if we're still in a backoff window
    if (conn.next_sync_after && new Date(conn.next_sync_after as string) > now) {
      results.push({ connectionId, inserted: 0, matched: 0, error: "backoff" })
      continue
    }

    const loginName = (conn.organisations as unknown as Array<{ yodlee_user_id: string | null }>)?.[0]?.yodlee_user_id ?? null
    if (!loginName) {
      results.push({ connectionId, inserted: 0, matched: 0, error: "no yodlee user" })
      continue
    }

    try {
      const cobrandToken = await yodlee.getCobrandToken()
      const userToken = await yodlee.getUserToken(cobrandToken, loginName)

      const fromDate = conn.last_synced_at
        ? new Date(conn.last_synced_at as string).toISOString().slice(0, 10)
        : new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)

      const rawTxns = await yodlee.getTransactions(
        userToken,
        conn.yodlee_account_id as string,
        fromDate,
        toDate,
      )

      const transactions = rawTxns.map(transformYodleeTransaction)
      const bankAccountId = (conn.bank_account_id as string | null) ?? ""
      const result = await syncYodleeTransactions(orgId, connectionId, bankAccountId, transactions, db)

      results.push({ connectionId, inserted: result.inserted, matched: result.matched, error: result.error })

      // Back off 15 min after daily sync to prevent hammering
      await db.from("bank_feed_connections").update({
        next_sync_after: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      }).eq("id", connectionId)
    } catch (err) {
      const errMsg = String(err)
      console.error(`bank-feed-sync: connection ${connectionId} failed:`, errMsg)

      // Back off 4 hours on error
      await db.from("bank_feed_connections").update({
        status: "error",
        last_sync_status: "error",
        last_sync_error: errMsg,
        next_sync_after: new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      }).eq("id", connectionId)

      results.push({ connectionId, inserted: 0, matched: 0, error: errMsg })
    }
  }

  console.log("bank-feed-sync complete:", results)
  return Response.json({ ok: true, results })
}
