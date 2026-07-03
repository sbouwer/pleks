/**
 * app/api/hoa/[hoaId]/reserve-fund/route.ts — list / post reserve-fund ledger entries for an HOA scheme
 *
 * Route:  GET/POST /api/hoa/[hoaId]/reserve-fund
 * Auth:   GET → gateway() (read, always available). POST → requireAgentWriteAccess("post_reserve_fund"):
 *         a reserve-fund posting is a financial ledger entry (net-new value), so it is lockdown gated.
 * Data:   reserve_fund_entries (org-scoped); POST verifies the parent hoa_entities row belongs to the org.
 * Notes:  Immutable ledger (insert-only). POST lockdown surfaces as a clean 403, never a 500.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { logQueryError } from "@/lib/supabase/logQueryError"

// GET /api/hoa/[hoaId]/reserve-fund — list entries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data, error: queryError } = await db
    .from("reserve_fund_entries")
    .select("*")
    .eq("hoa_id", hoaId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
  logQueryError("GET reserve_fund_entries", queryError)

  return NextResponse.json(data ?? [])
}

// POST /api/hoa/[hoaId]/reserve-fund — add an entry (immutable ledger)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  let gw
  try {
    gw = await requireAgentWriteAccess("post_reserve_fund")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { db, userId, orgId } = gw

  const { data: hoa, error: hoaError } = await db
    .from("hoa_entities")
    .select("id")
    .eq("id", hoaId)
    .eq("org_id", orgId)
    .single()
  logQueryError("POST hoa_entities", hoaError)
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

  const { data, error } = await db
    .from("reserve_fund_entries")
    .insert({
      org_id: orgId,
      hoa_id: hoaId,
      entry_type: body.entry_type,
      direction: body.direction,
      amount_cents: body.amount_cents,
      description: body.description.trim(),
      reference: body.reference?.trim() ?? null,
      created_by: userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
