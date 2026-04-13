/**
 * POST /api/yodlee/callback
 * Called by FastLink widget on successful account linking.
 * Stores the connection in bank_feed_connections.
 */

import { NextRequest } from "next/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { yodlee } from "@/lib/yodlee/client"

interface FastLinkCallbackData {
  providerAccountId: string
  providerId: string
  status?: string
  additionalStatus?: string
}

export async function POST(req: NextRequest) {
  const gw = await gatewaySSR()
  if (!gw) return Response.json({ error: "Not authenticated" }, { status: 401 })
  const { db, orgId, userId } = gw

  const body = (await req.json()) as FastLinkCallbackData
  const { providerAccountId, providerId } = body

  if (!providerAccountId) return Response.json({ error: "Missing providerAccountId" }, { status: 400 })

  try {
    // Get the Yodlee user token to fetch account details
    const { data: org } = await db
      .from("organisations")
      .select("yodlee_user_id")
      .eq("id", orgId)
      .single()

    if (!org?.yodlee_user_id) return Response.json({ error: "No Yodlee user for org" }, { status: 400 })

    const cobrandToken = await yodlee.getCobrandToken()
    const userToken = await yodlee.getUserToken(cobrandToken, org.yodlee_user_id as string)
    const accounts = await yodlee.getAccounts(userToken)

    // Find the newly linked account
    const account = accounts.find(
      (a) => String(a.providerAccountId) === String(providerAccountId)
    )

    const bankName = account?.providerName ?? "Bank"
    const accountMask = account?.accountNumber ? `****${account.accountNumber.slice(-4)}` : null
    const accountType = account?.accountType?.toLowerCase() ?? null
    const yodleeAccountId = account ? String(account.id) : null

    const { data: conn, error } = await db
      .from("bank_feed_connections")
      .insert({
        org_id: orgId,
        yodlee_provider_account_id: providerAccountId,
        yodlee_account_id: yodleeAccountId,
        yodlee_provider_id: String(providerId),
        bank_name: bankName,
        account_mask: accountMask,
        account_type: accountType,
        status: "active",
        created_by: userId,
      })
      .select("id")
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    await db.from("audit_log").insert({
      org_id: orgId,
      table_name: "bank_feed_connections",
      record_id: conn.id,
      action: "INSERT",
      changed_by: userId,
      new_values: { bank_name: bankName, provider_account_id: providerAccountId },
    })

    return Response.json({ success: true, connectionId: conn.id })
  } catch (err) {
    console.error("Yodlee callback error:", err)
    return Response.json({ error: "Failed to store connection" }, { status: 502 })
  }
}
