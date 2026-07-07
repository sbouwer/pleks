/**
 * app/api/wo/[number]/invoice/route.ts — contractor submits an invoice via the work-order portal
 *
 * Route:  POST /api/wo/[number]/invoice
 * Auth:   token — the [number] URL segment (work_order_number) is authoritative; body token must equal
 *         that request's work_order_token AND the token must not be revoked (verifyWorkOrderAccess)
 * Data:   reads maintenance_requests; inserts supplier_invoices (payment_source 'trust', status 'submitted')
 * Notes:  identity is derived from the URL work_order_number, not a caller-supplied body id; only allowed once status is pending_completion/completed/closed
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { verifyWorkOrderAccess } from "@/lib/maintenance/verifyWorkOrderAccess"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params
  const body = await req.json() as {
    token: string
    invoice_number?: string
    invoice_date: string
    description: string
    amount_excl_vat_cents: number
    vat_amount_cents: number
    amount_incl_vat_cents: number
  }

  const { token } = body

  if (!token || !body.description || !body.invoice_date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Auth: URL work_order_number is authoritative; validates token + revocation.
  const request = await verifyWorkOrderAccess(supabase, number, token)
  if (!request) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }
  const requestId = request.id

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
