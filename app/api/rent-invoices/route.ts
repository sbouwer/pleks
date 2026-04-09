import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = await createServiceClient()
  const { data } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  return data?.org_id ?? null
}

// GET /api/rent-invoices?status=open
// Returns open rent invoices with tenant + unit info for batch payment entry
export async function GET(req: NextRequest) {
  const orgId = await getOrgId()
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const status = new URL(req.url).searchParams.get("status") ?? "open"
  const service = await createServiceClient()

  const { data, error } = await service
    .from("rent_invoices")
    .select("id, invoice_number, period_from, period_to, rent_amount_cents, total_amount_cents, balance_cents, payment_reference, status, tenant_id, unit_id, lease_id, tenant_view(first_name, last_name), units(unit_number)")
    .eq("org_id", orgId)
    .eq("status", status)
    .gt("balance_cents", 0)
    .order("due_date", { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

interface PaymentRecord {
  invoiceId: string
  amountCents: number
  paymentDate: string
  method: string
  reference: string
}

// POST /api/rent-invoices — record batch payments
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

  const { payments } = await req.json() as { payments: PaymentRecord[] }
  if (!payments?.length) return NextResponse.json({ error: "No payments provided" }, { status: 400 })

  const orgId = membership.org_id
  let recorded = 0
  let totalCents = 0

  for (const p of payments) {
    if (!p.invoiceId || p.amountCents <= 0) continue

    // Fetch invoice (verify ownership)
    const { data: inv } = await service
      .from("rent_invoices")
      .select("id, org_id, lease_id, unit_id, tenant_id, balance_cents, amount_paid_cents, total_amount_cents")
      .eq("id", p.invoiceId)
      .eq("org_id", orgId)
      .single()

    if (!inv || inv.balance_cents <= 0) continue

    const applied = Math.min(p.amountCents, inv.balance_cents)
    const newPaid = (inv.amount_paid_cents ?? 0) + applied
    const newBalance = inv.balance_cents - applied
    const newStatus = newBalance <= 0 ? "paid" : "partial"

    // Update invoice
    await service.from("rent_invoices").update({
      amount_paid_cents: newPaid,
      balance_cents: newBalance,
      status: newStatus,
      paid_at: newBalance <= 0 ? p.paymentDate : null,
      updated_at: new Date().toISOString(),
    }).eq("id", p.invoiceId)

    // Record trust transaction
    const statementMonth = new Date(p.paymentDate)
    const monthStart = new Date(statementMonth.getFullYear(), statementMonth.getMonth(), 1)
      .toISOString().split("T")[0]

    await service.from("trust_transactions").insert({
      org_id: orgId,
      lease_id: inv.lease_id,
      unit_id: inv.unit_id,
      transaction_type: "rent_received",
      direction: "credit",
      amount_cents: applied,
      description: `Rent payment${p.reference ? ` — ref: ${p.reference}` : ""}`,
      reference: p.reference || null,
      invoice_id: p.invoiceId,
      statement_month: monthStart,
      created_by: user.id,
    })

    recorded++
    totalCents += applied
  }

  return NextResponse.json({ ok: true, recorded, totalCents })
}
