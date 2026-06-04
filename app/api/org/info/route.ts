/**
 * app/api/org/info/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("GET user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { data: org, error: orgError } = await supabase
    .from("organisations")
    .select("id, name, clause_edit_confirmed_at, custom_template_active")
    .eq("id", membership.org_id)
    .single()
    logQueryError("GET organisations", orgError)

  return NextResponse.json({
    orgId: org?.id ?? membership.org_id,
    orgName: org?.name ?? "",
    clauseEditConfirmedAt: org?.clause_edit_confirmed_at ?? null,
    customTemplateActive: org?.custom_template_active ?? false,
  })
}
