/**
 * app/api/wo/[number]/quote/route.ts — contractor submits a quote/estimate via the work-order portal
 *
 * Route:  POST /api/wo/[number]/quote
 * Auth:   token — the [number] URL segment (work_order_number) is authoritative; body token must equal
 *         that request's work_order_token AND the token must not be revoked (verifyWorkOrderAccess)
 * Data:   reads maintenance_requests; inserts maintenance_quotes; updates maintenance_requests.quoted_cost_cents
 * Notes:  identity is derived from the URL work_order_number, not a caller-supplied body id
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { verifyWorkOrderAccess } from "@/lib/maintenance/verifyWorkOrderAccess"

interface LineItem {
  description: string
  amount_cents: number
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params
  const body = await req.json() as {
    token: string
    quote_type: string
    line_items: LineItem[]
    subtotal_excl_vat_cents: number
    vat_amount_cents: number
    total_incl_vat_cents: number
    scope_of_work?: string
    contractor_notes?: string
  }

  const { token } = body

  if (!token) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Auth: URL work_order_number is authoritative; validates token + revocation.
  const request = await verifyWorkOrderAccess(supabase, number, token)
  if (!request) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }
  const requestId = request.id

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
