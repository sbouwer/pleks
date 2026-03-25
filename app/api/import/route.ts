import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { importProperties } from "@/lib/import/propertyImport"
import { importTenants } from "@/lib/import/tenantImport"
import { importLeases } from "@/lib/import/leaseImport"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

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
