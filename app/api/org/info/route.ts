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

  const { data: org } = await supabase
    .from("organisations")
    .select("id, name, clause_edit_confirmed_at, custom_template_active")
    .eq("id", membership.org_id)
    .single()

  return NextResponse.json({
    orgId: org?.id ?? membership.org_id,
    orgName: org?.name ?? "",
    clauseEditConfirmedAt: org?.clause_edit_confirmed_at ?? null,
    customTemplateActive: org?.custom_template_active ?? false,
  })
}
