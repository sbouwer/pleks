import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { importProperties } from "@/lib/import/propertyImport"
import { importTenants } from "@/lib/import/tenantImport"
import { importLeases } from "@/lib/import/leaseImport"
import { getMembership } from "@/lib/supabase/getMembership"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })
  if (!membership.isAdmin) {
    return NextResponse.json({ error: "Admin access required to import data" }, { status: 403 })
  }

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
      result = await importProperties(csvText, membership.org_id, user.id)
      break
    case "tenants":
      result = await importTenants(csvText, membership.org_id, user.id)
      break
    case "leases":
      result = await importLeases(csvText, membership.org_id, user.id)
      break
    default:
      return NextResponse.json({ error: "Invalid import type" }, { status: 400 })
  }

  return NextResponse.json(result)
}
