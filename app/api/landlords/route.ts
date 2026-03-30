import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { firstName, lastName, email, phone, idNumber } = await req.json()

  if (!firstName?.trim() && !lastName?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const fullName = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ")

  const { error } = await service.from("pending_landlords").insert({
    org_id: membership.org_id,
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    full_name: fullName || null,
    email: email?.trim() || null,
    phone: phone?.trim() || null,
    id_number: idNumber?.trim() || null,
    created_by: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
