/**
 * app/api/rent-invoices/route.ts — batch rent-invoice payment application
 *
 * Route:  GET /api/rent-invoices?status= (open invoices for batch entry) · POST (apply a batch of payments)
 * Auth:   auth.getUser + user_orgs membership; org-scoped service client
 * Data:   rent_invoices; POST applies each payment via apply_invoice_payment_atomic (invoice status +
 *         trust rent_received commit atomically — this endpoint records NO payment row).
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = await createServiceClient()
  const { data, error: queryError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("getOrgId user_orgs", queryError)
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

const VALID_PAYMENT_METHODS = ["eft", "cash", "card", "bank_recon_matched"] as const
type PaymentMethod = typeof VALID_PAYMENT_METHODS[number]

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
  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("POST user_orgs", membershipError)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { payments } = await req.json() as { payments: PaymentRecord[] }
  if (!payments?.length) return NextResponse.json({ error: "No payments provided" }, { status: 400 })

  const orgId = membership.org_id
  let recorded = 0
  let totalCents = 0

  for (const p of payments) {
    if (!p.invoiceId || p.amountCents <= 0) continue

    const safeMethod = (VALID_PAYMENT_METHODS as readonly string[]).includes(p.method)
      ? (p.method as PaymentMethod)
      : null

    // Atomic invoice-apply + trust posting (ADDENDUM_TRUST_RPC_ATOMICITY step 3). This endpoint applies
    // against invoices WITHOUT creating a payment row, so it uses record_payment_atomic's narrow sibling:
    // invoice status + trust rent_received commit together (org-scoped resolve; returns cents applied).
    const { data: applied, error: rpcErr } = await service.rpc("apply_invoice_payment_atomic", {
      p_org_id: orgId,
      p_invoice_id: p.invoiceId,
      p_amount_cents: p.amountCents,
      p_payment_date: p.paymentDate,
      p_method: safeMethod,
      p_reference: p.reference || null,
      p_recorded_by: user.id,
    })
    if (rpcErr) { logQueryError("apply_invoice_payment_atomic", rpcErr); continue }
    const appliedCents = Number(applied ?? 0)
    if (appliedCents <= 0) continue

    recorded++
    totalCents += appliedCents
  }

  return NextResponse.json({ ok: true, recorded, totalCents })
}
