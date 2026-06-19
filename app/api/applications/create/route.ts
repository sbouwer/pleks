/**
 * POST /api/applications/create — public, UNAUTHENTICATED applicant endpoint.
 * Creates an application record + 30-day resumable access token from the apply flow.
 * Returns { applicationId, token }.
 *
 * Security posture (anonymous by design):
 *  - org_id is derived SERVER-SIDE from slug → listing.org_id — never trusted from the client (the
 *    multi-tenant boundary). The applicant has no session.
 *  - Rate-limited per IP (5/min).
 *  - income_sources is validated + bounded (row cap, period enum, amount clamp, key/label length) and its
 *    monthly_cents is RECOMPUTED server-side — the client shape is never stored verbatim. income_sources is
 *    the source of truth; gross_monthly_income_cents is its derived monthly-total cache.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "crypto"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const INCOME_PERIODS = ["month", "quarter", "annual"] as const
type IncomePeriod = typeof INCOME_PERIODS[number]
const PERIOD_DIVISOR: Record<IncomePeriod, number> = { month: 1, quarter: 3, annual: 12 }
const MAX_INCOME_ROWS = 20
const MAX_AMOUNT_CENTS = 1_000_000_000 // R10m per period — generous ceiling that rejects garbage
type StoredIncomeRow = { key: string; label: string; amount_cents: number; period: IncomePeriod; monthly_cents: number }

/** Validate + bound the client income breakdown and RECOMPUTE monthly_cents server-side (never trust the
 *  client's monthly figure). Returns the stored rows + the derived monthly total (the affordability anchor). */
function parseIncomeSources(raw: unknown): { rows: StoredIncomeRow[]; totalMonthlyCents: number } | null {
  if (!Array.isArray(raw)) return null
  const rows: StoredIncomeRow[] = []
  for (const item of raw.slice(0, MAX_INCOME_ROWS)) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const period: IncomePeriod = INCOME_PERIODS.includes(r.period as IncomePeriod) ? (r.period as IncomePeriod) : "month"
    const amount_cents = Math.min(MAX_AMOUNT_CENTS, Math.max(0, Math.round(Number(r.amount_cents) || 0)))
    if (amount_cents <= 0) continue
    rows.push({
      key: typeof r.key === "string" ? r.key.slice(0, 40) : "",
      label: typeof r.label === "string" ? r.label.slice(0, 60) : "",
      amount_cents,
      period,
      monthly_cents: Math.round(amount_cents / PERIOD_DIVISOR[period]),
    })
  }
  const totalMonthlyCents = rows.reduce((s, r) => s + r.monthly_cents, 0)
  return { rows, totalMonthlyCents }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!rateLimit(`app-create:${ip}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const body = await req.json() as Record<string, string>
  const service = getServiceClient()

  // Validate slug → find listing
  const { data: listing, error: listingError } = await service
    .from("listings")
    .select("id, org_id, unit_id, property_id, asking_rent_cents")
    .eq("public_slug", body.slug)
    .eq("status", "active")
    .maybeSingle()
    logQueryError("POST listings", listingError)

  if (!listing) {
    return NextResponse.json({ error: "Listing not found or no longer active" }, { status: 404 })
  }

  // Public applicant → no creating agent. Route to the responsible agent (unit → property manager) so it
  // lands in their My-work; null falls to Everyone/Org (ADDENDUM_TEAMS D-11/12), visible under All.
  let routedAgent: string | null = null
  if (listing.unit_id) {
    const { data: unit, error: unitErr } = await service
      .from("units").select("assigned_agent_id").eq("id", listing.unit_id).maybeSingle()
    logQueryError("POST units routing", unitErr)
    routedAgent = unit?.assigned_agent_id ?? null
  }
  if (!routedAgent && listing.property_id) {
    const { data: prop, error: propErr } = await service
      .from("properties").select("managing_agent_id").eq("id", listing.property_id).maybeSingle()
    logQueryError("POST properties routing", propErr)
    routedAgent = prop?.managing_agent_id ?? null
  }

  // income_sources is the source of truth; gross_monthly_income_cents is its derived monthly-total cache.
  // Recompute the total from the validated breakdown here; fall back to the legacy scalar body field for the
  // older /apply flow that doesn't send a breakdown yet. (Any future edit path MUST recompute both or drift.)
  const parsedIncome = parseIncomeSources((body as Record<string, unknown>).income_sources)
  let incomeCents: number | null = null
  if (parsedIncome) {
    incomeCents = parsedIncome.totalMonthlyCents
  } else if (body.gross_monthly_income) {
    incomeCents = Math.round(Number.parseFloat(body.gross_monthly_income) * 100)
  }

  // Create application
  const { data: application, error: appErr } = await service
    .from("applications")
    .insert({
      org_id: listing.org_id,
      listing_id: listing.id,
      unit_id: listing.unit_id,
      first_name: body.first_name,
      last_name: body.last_name,
      applicant_email: body.email,
      applicant_phone: body.phone,
      id_type: body.id_type,
      id_number: body.id_number,
      date_of_birth: body.date_of_birth || null,
      nationality: body.nationality || null,
      permit_type: body.permit_type || null,
      permit_number: body.permit_number || null,
      permit_expiry_date: body.permit_expiry_date || null,
      is_foreign_national: body.id_type !== "sa_id",
      employment_type: body.employment_type,
      employer_name: body.employer_name || null,
      employment_start_date: body.employment_start_date || null,
      gross_monthly_income_cents: incomeCents,
      income_sources: parsedIncome?.rows ?? null,
      applicant_motivation: body.motivation || null,
      stage1_status: "pending_documents",
      assigned_user_id: routedAgent,
      assigned_at: routedAgent ? new Date().toISOString() : null,
    })
    .select("id")
    .single()

  if (appErr || !application) {
    console.error("[applications/create]", appErr)
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 })
  }

  // Audit the application creation — public applicant (no auth user), so actor is null.
  // Never log id_number (recordAudit drops it anyway); just the non-PII context.
  await recordAudit(service, {
    orgId: listing.org_id, actorId: null, action: "INSERT", table: "applications", recordId: application.id,
    after: { action: "application_created", listing_id: listing.id, unit_id: listing.unit_id },
  })

  // Create access token (30-day resumable)
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await service.from("application_tokens").insert({
    application_id: application.id,
    token,
    token_type: "application",
    applicant_email: body.email,
    expires_at: expiresAt,
  })

  return NextResponse.json({ applicationId: application.id, token })
}
