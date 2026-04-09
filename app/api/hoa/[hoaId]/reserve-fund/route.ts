import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/hoa/[hoaId]/reserve-fund — list entries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabase
    .from("reserve_fund_entries")
    .select("*")
    .eq("hoa_id", hoaId)
    .order("created_at", { ascending: false })

  return NextResponse.json(data ?? [])
}

// POST /api/hoa/[hoaId]/reserve-fund — add an entry (immutable ledger)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
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

  const { data: hoa } = await supabase
    .from("hoa_entities")
    .select("id")
    .eq("id", hoaId)
    .eq("org_id", membership.org_id)
    .single()
  if (!hoa) return NextResponse.json({ error: "HOA not found" }, { status: 404 })

  const body = await req.json() as {
    entry_type: string
    direction: string
    amount_cents: number
    description: string
    reference?: string
  }

  if (!body.entry_type || !body.direction || !body.amount_cents || !body.description?.trim()) {
    return NextResponse.json({ error: "entry_type, direction, amount_cents and description required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("reserve_fund_entries")
    .insert({
      org_id: membership.org_id,
      hoa_id: hoaId,
      entry_type: body.entry_type,
      direction: body.direction,
      amount_cents: body.amount_cents,
      description: body.description.trim(),
      reference: body.reference?.trim() ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
