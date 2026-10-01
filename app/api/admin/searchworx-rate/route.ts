/**
 * app/api/admin/searchworx-rate/route.ts — list held Searchworx prices; apply or reject one (ADDENDUM_14V §3.3 step 4)
 *
 * Route:  GET, POST /api/admin/searchworx-rate
 * Auth:   isAdminAuthenticated() (ADMIN_SECRET HMAC — never exposed to agents), both methods
 * Data:   searchworx_rate_holds (read/update), searchworx_rates (insert on apply); audit_log under PLATFORM_ORG_ID
 * Notes:  The one place a human moves a rate (§3.3: "an admin applies it through the override route or rejects
 *         it"). POST body: { hold_id, decision: "apply" | "reject", note? }.
 *         APPLY inserts an `admin_override` rate row at the held value, dated TODAY (SA): an admin applying a
 *         price means "from now", and admin_override wins a same-day tie in read.ts. REJECT records the
 *         decision; the cron never applies or re-alerts a rejected (product, value) again.
 *         Only a hold still `held` can be decided — the update is guarded on status, so a double submit or a
 *         race between two admins decides once and the loser gets 409. A second admin_override for the same
 *         product on the same day is the rates table's UNIQUE — also 409, and the hold stays held.
 *         Audit (ruled 2026-10-01): a platform act, attributed to PLATFORM_ORG_ID — never a literal.
 */
import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { PLATFORM_ORG_ID } from "@/lib/comms/platform-org"
import { saTodayISO } from "@/lib/dates"

const HOLD_COLUMNS = "id, product_key, held_cents, current_cents, observation_id, status, first_held_at"

interface HoldRow {
  id: string
  product_key: string
  held_cents: number
  current_cents: number | null
  observation_id: string
  status: string
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const db = await createServiceClient()
  const { data, error } = await db
    .from("searchworx_rate_holds")
    .select(HOLD_COLUMNS)
    .eq("status", "held")
    .order("first_held_at", { ascending: false })
  if (error) {
    console.error("[admin/searchworx-rate] holds read failed:", error.message)
    return NextResponse.json({ error: "holds could not be read" }, { status: 500 })
  }
  return NextResponse.json({ holds: data ?? [] })
}

type Db = Awaited<ReturnType<typeof createServiceClient>>
type Decision = "apply" | "reject"

function parseBody(body: Record<string, unknown> | null): { holdId: string; decision: Decision; note: string | null } | null {
  const holdId = typeof body?.hold_id === "string" ? body.hold_id : ""
  const decision = body?.decision
  if (!holdId || (decision !== "apply" && decision !== "reject")) return null
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) || null : null
  return { holdId, decision, note }
}

/** CLAIM: the status-guarded update makes the decision single. Returns false when another request won. */
async function claimHold(db: Db, holdId: string, status: "applied" | "rejected", note: string | null): Promise<boolean> {
  const { data, error } = await db
    .from("searchworx_rate_holds")
    .update({ status, decided_at: new Date().toISOString(), decision_note: note })
    .eq("id", holdId)
    .eq("status", "held")
    .select("id")
  if (error) throw new Error(`hold update failed — ${error.message}`)
  return (data ?? []).length > 0
}

/** Writes the admin_override row for a claimed hold; on failure releases the claim so it can be decided again. */
async function writeOverride(db: Db, h: HoldRow, note: string | null): Promise<{ rateId: string } | { conflict: true }> {
  const why = note ? ": " + note : ""
  const { data: rate, error } = await db
    .from("searchworx_rates")
    .insert({
      product_key: h.product_key,
      cost_excl_vat_cents: h.held_cents,
      effective_date: saTodayISO(),
      source: "admin_override",
      observation_id: h.observation_id,
      notes: `admin applied held price (was ${h.current_cents ?? "none"})${why}`,
    })
    .select("id")
    .single()
  if (error || !rate) {
    const { error: releaseError } = await db
      .from("searchworx_rate_holds")
      .update({ status: "held", decided_at: null, decision_note: null })
      .eq("id", h.id)
      .eq("status", "applied")
    if (releaseError) console.error("[admin/searchworx-rate] hold release failed:", releaseError.message)
    if (error?.code === "23505") return { conflict: true }
    throw new Error(`rate insert failed — ${error?.message ?? "no row returned"}`)
  }
  const rateId = (rate as { id: string }).id
  const { error: linkError } = await db.from("searchworx_rate_holds").update({ rate_id: rateId }).eq("id", h.id)
  if (linkError) console.error("[admin/searchworx-rate] hold rate_id link failed:", linkError.message)
  return { rateId }
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const input = parseBody((await req.json().catch(() => null)) as Record<string, unknown> | null)
  if (!input) {
    return NextResponse.json({ error: "hold_id and decision (apply | reject) are required" }, { status: 400 })
  }

  const db = await createServiceClient()
  const { data: hold, error: readError } = await db.from("searchworx_rate_holds").select(HOLD_COLUMNS).eq("id", input.holdId).maybeSingle()
  if (readError) {
    console.error("[admin/searchworx-rate] hold read failed:", readError.message)
    return NextResponse.json({ error: "hold could not be read" }, { status: 500 })
  }
  if (!hold) return NextResponse.json({ error: "no such hold" }, { status: 404 })
  const h = hold as HoldRow
  if (h.status !== "held") return NextResponse.json({ error: `hold is already ${h.status}` }, { status: 409 })

  const status = input.decision === "apply" ? "applied" : "rejected"
  let rateId: string | null = null
  try {
    if (!(await claimHold(db, h.id, status, input.note))) {
      return NextResponse.json({ error: "hold was decided concurrently" }, { status: 409 })
    }
    if (input.decision === "apply") {
      const written = await writeOverride(db, h, input.note)
      if ("conflict" in written) {
        return NextResponse.json({ error: "an admin override for this product already exists today — hold left as held" }, { status: 409 })
      }
      rateId = written.rateId
    }
  } catch (e) {
    console.error("[admin/searchworx-rate]", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "decision could not be recorded — hold left as held" }, { status: 500 })
  }

  await recordAudit(db, {
    orgId: PLATFORM_ORG_ID,
    action: "UPDATE",
    table: "searchworx_rate_holds",
    recordId: h.id,
    before: { status: "held" },
    after: { action: "searchworx_rate_hold_decided", status, product_key: h.product_key, held_cents: h.held_cents, current_cents: h.current_cents, rate_id: rateId },
  })

  return NextResponse.json({ ok: true, status, rate_id: rateId })
}
