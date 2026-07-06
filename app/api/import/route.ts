/**
 * app/api/import/route.ts — CSV bulk-import of properties / tenants / leases into the caller's own org
 *
 * Route:  POST /api/import  (multipart: "file" CSV, "type" = properties|tenants|leases)
 * Auth:   requireAgentWriteAccess("bulk_import") — bulk import creates net-new business objects, so it is
 *         subscription-lockdown gated; additionally requires the caller to be an org admin (owner/is_admin).
 * Data:   dispatches to lib/import/{property,tenant,lease}Import, all org-scoped by the gateway orgId.
 * Notes:  One gate before the switch covers all three import types. Lockdown resolves first (inside
 *         requireAgentWriteAccess) then the admin check — a paused org sees a clean 403
 *         { code: "subscription_locked" } regardless of admin status.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { importProperties } from "@/lib/import/propertyImport"
import { importTenants } from "@/lib/import/tenantImport"
import { importLeases } from "@/lib/import/leaseImport"

export async function POST(req: NextRequest) {
  let gw
  try {
    gw = await requireAgentWriteAccess("bulk_import")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Bulk import is an admin-only surface — org owner or an is_admin user (unchanged authority gate).
  if (!gw.isAdmin) {
    return NextResponse.json({ error: "Admin access required to import data" }, { status: 403 })
  }
  const { orgId, userId } = gw

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const importType = formData.get("type") as string

  if (!file || !importType) {
    return NextResponse.json({ error: "File and type required" }, { status: 400 })
  }

  const csvText = await file.text()

  let result
  switch (importType) {
    case "properties":
      result = await importProperties(csvText, orgId, userId)
      break
    case "tenants":
      result = await importTenants(csvText, orgId, userId)
      break
    case "leases":
      result = await importLeases(csvText, orgId, userId)
      break
    default:
      return NextResponse.json({ error: "Invalid import type" }, { status: 400 })
  }

  return NextResponse.json(result)
}
