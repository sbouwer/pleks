import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
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

  const { data: templates } = await supabase
    .from("org_lease_templates")
    .select("id, name, lease_type, is_default, created_at")
    .eq("org_id", membership.org_id)
    .order("created_at", { ascending: false })

  return NextResponse.json({ templates: templates ?? [] })
}
