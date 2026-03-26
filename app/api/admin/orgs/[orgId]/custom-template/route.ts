import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"

async function verifyAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  return token && token === process.env.ADMIN_SECRET
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  if (!(await verifyAdmin())) {
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
