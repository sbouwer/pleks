/**
 * POST /api/yodlee/token
 * Returns a user-scoped Yodlee access token for the FastLink widget.
 * Creates a Yodlee user for the org if one doesn't exist yet.
 */

import { NextRequest } from "next/server"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { yodlee } from "@/lib/yodlee/client"

export async function POST(_req: NextRequest) {
  const gw = await gatewaySSR()
  if (!gw) return Response.json({ error: "Not authenticated" }, { status: 401 })
  const { db, orgId } = gw

  // Check/create Yodlee user for this org
  const { data: org, error: orgErr } = await db
    .from("organisations")
    .select("id, yodlee_user_id")
    .eq("id", orgId)
    .single()

  if (orgErr || !org) return Response.json({ error: "Organisation not found" }, { status: 400 })

  try {
    const cobrandToken = await yodlee.getCobrandToken()
    let loginName = org.yodlee_user_id as string | null

    if (!loginName) {
      // Create a new Yodlee user for this org
      loginName = `pleks-${orgId.replaceAll("-", "").slice(0, 20)}`
      await yodlee.registerUser(cobrandToken, loginName)
      await db
        .from("organisations")
        .update({ yodlee_user_id: loginName, yodlee_user_created_at: new Date().toISOString() })
        .eq("id", orgId)
    }

    const userToken = await yodlee.getUserToken(cobrandToken, loginName)
    const config = yodlee.getFastLinkConfig(
      userToken,
      `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/yodlee/callback`,
    )

    return Response.json({ config, userToken })
  } catch (err) {
    console.error("Yodlee token error:", err)
    return Response.json({ error: "Failed to get Yodlee token" }, { status: 502 })
  }
}
