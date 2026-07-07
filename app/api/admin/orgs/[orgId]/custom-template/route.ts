/**
 * app/api/admin/orgs/[orgId]/custom-template/route.ts — toggle/set an org's custom lease template
 *
 * Route:  PATCH /api/admin/orgs/[orgId]/custom-template
 * Auth:   isAdminAuthenticated() (admin portal HMAC gate)
 * Data:   updates organisations.custom_template_active / custom_template_path
 */
import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orgId } = await params

  const { active, templatePath } = (await req.json()) as {
    active?: boolean
    templatePath?: string
  }

  if (active === undefined && templatePath === undefined) {
    return NextResponse.json(
      { error: "Provide active and/or templatePath" },
      { status: 400 }
    )
  }

  const supabase = await createServiceClient()

  const updates: Record<string, boolean | string> = {}
  if (active !== undefined) {
    updates.custom_template_active = active
  }
  if (templatePath !== undefined) {
    updates.custom_template_path = templatePath
  }

  const { error } = await supabase
    .from("organisations")
    .update(updates)
    .eq("id", orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
