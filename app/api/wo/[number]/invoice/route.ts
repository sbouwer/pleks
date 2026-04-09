import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const body = await req.json() as {
    requestId: string
    token: string
    invoice_number?: string
    invoice_date: string
    description: string
    amount_excl_vat_cents: number
    vat_amount_cents: number
    amount_incl_vat_cents: number
  }

  const { requestId, token } = body

  if (!requestId || !token || !body.description || !body.invoice_date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Verify token + get org_id, contractor_id, property_id
  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, org_id, contractor_id, property_id, unit_id, work_order_token, status")
    .eq("id", requestId)
    .single()

  if (!request || request.work_order_token !== token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }

  // Only allow invoice submission after completion report is submitted
  const invoiceableStatuses = ["pending_completion", "completed", "closed"]
  if (!invoiceableStatuses.includes(request.status)) {
    return NextResponse.json(
      { error: "Invoice can only be submitted after the completion report" },
      { status: 400 }
    )
  }

  if (!request.contractor_id) {
    return NextResponse.json({ error: "No contractor assigned to this work order" }, { status: 400 })
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.exec(body.invoice_date)) {
    return NextResponse.json({ error: "Invalid invoice date format" }, { status: 400 })
  }

  const { data: invoice, error } = await supabase
    .from("supplier_invoices")
    .insert({
      org_id: request.org_id,
      contractor_id: request.contractor_id,
      maintenance_request_id: requestId,
      property_id: request.property_id,
      unit_id: request.unit_id,
      invoice_number: body.invoice_number ?? null,
      invoice_date: body.invoice_date,
      description: body.description,
      amount_excl_vat_cents: body.amount_excl_vat_cents,
      vat_amount_cents: body.vat_amount_cents,
      amount_incl_vat_cents: body.amount_incl_vat_cents,
      payment_source: "trust",
      status: "submitted",
    })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, invoiceId: invoice.id })
}
