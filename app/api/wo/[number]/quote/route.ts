import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

interface LineItem {
  description: string
  amount_cents: number
}

export async function POST(req: Request) {
  const body = await req.json() as {
    requestId: string
    token: string
    quote_type: string
    line_items: LineItem[]
    subtotal_excl_vat_cents: number
    vat_amount_cents: number
    total_incl_vat_cents: number
    scope_of_work?: string
    contractor_notes?: string
  }

  const { requestId, token } = body

  if (!requestId || !token) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Verify token + get org_id and contractor_id
  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, org_id, contractor_id, work_order_token, status")
    .eq("id", requestId)
    .single()

  if (!request || request.work_order_token !== token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }

  if (!request.contractor_id) {
    return NextResponse.json({ error: "No contractor assigned to this work order" }, { status: 400 })
  }

  // Validate quote_type
  const quoteType = body.quote_type === "estimate" ? "estimate" : "quote"

  // Validate line_items
  if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
    return NextResponse.json({ error: "At least one line item is required" }, { status: 400 })
  }

  const { data: quote, error } = await supabase
    .from("maintenance_quotes")
    .insert({
      org_id: request.org_id,
      request_id: requestId,
      contractor_id: request.contractor_id,
      quote_type: quoteType,
      line_items: body.line_items,
      subtotal_excl_vat_cents: body.subtotal_excl_vat_cents,
      vat_amount_cents: body.vat_amount_cents,
      total_incl_vat_cents: body.total_incl_vat_cents,
      scope_of_work: body.scope_of_work ?? null,
      contractor_notes: body.contractor_notes ?? null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update quoted_cost_cents on the maintenance request
  await supabase
    .from("maintenance_requests")
    .update({ quoted_cost_cents: body.total_incl_vat_cents })
    .eq("id", requestId)

  return NextResponse.json({ ok: true, quoteId: quote.id })
}
