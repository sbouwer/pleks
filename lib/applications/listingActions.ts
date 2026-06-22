"use server"

/**
 * lib/applications/listingActions.ts — agent server actions to edit / delete a rental listing.
 *
 * Auth:   requireAgentWriteAccess (org-scoped + audited)
 * Data:   listings + applications + emails
 * Notes:  Edit: if a MATERIAL field changes and the listing has live submitted applicants, each is emailed what
 *         changed. Delete: if submitted applicants exist they are DECLINED (audited + neutral email) and the
 *         listing is ARCHIVED (status='expired') — the application records are kept (evidentiary). A listing with
 *         no submissions (e.g. a test listing) is hard-deleted.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import { revalidatePath } from "next/cache"
import { formatZAR } from "@/lib/constants"
import { buildEmailContext } from "./buildEmailContext"
import { sendListingUpdated } from "./emails"
import { declineStage1Action } from "./applicationActions"

export interface ListingEditInput {
  asking_rent_cents?: number
  available_from?: string | null
  closes_at?: string | null
  description?: string | null
  requirements?: string | null
  min_income_multiple?: number
  pet_friendly?: boolean
  status?: string
}

interface MaterialField { key: keyof ListingEditInput; label: string; fmt?: (v: unknown) => string }
// Fields whose change is material to an applicant's decision → triggers the "listing updated" email.
const MATERIAL_FIELDS: MaterialField[] = [
  { key: "asking_rent_cents", label: "Monthly rent", fmt: (v) => (typeof v === "number" ? `${formatZAR(v)}/mo` : "—") },
  { key: "available_from", label: "Available from", fmt: (v) => (v ? String(v) : "—") },
  { key: "closes_at", label: "Applications close", fmt: (v) => (v ? String(v) : "—") },
  { key: "requirements", label: "Requirements", fmt: (v) => (v ? String(v) : "—") },
  { key: "pet_friendly", label: "Pets", fmt: (v) => (v ? "Allowed" : "Not allowed") },
  { key: "min_income_multiple", label: "Min income multiple", fmt: (v) => (v != null ? String(v) : "—") },
]

export async function updateListingAction(listingId: string, input: ListingEditInput) {
  const gw = await requireAgentWriteAccess("update_listing")
  const { db, userId, orgId } = gw

  const { data: before, error: bErr } = await db
    .from("listings")
    .select("asking_rent_cents, available_from, closes_at, requirements, pet_friendly, min_income_multiple, description, status")
    .eq("id", listingId).eq("org_id", orgId).maybeSingle()
  if (bErr) return { error: bErr.message }
  if (!before) return { error: "Listing not found" }

  const { error } = await db.from("listings").update(input).eq("id", listingId).eq("org_id", orgId)
  if (error) return { error: error.message }

  // Material diff → what an applicant would care about.
  const changes = MATERIAL_FIELDS
    .filter((m) => input[m.key] !== undefined && input[m.key] !== (before as Record<string, unknown>)[m.key])
    .map((m) => ({ label: m.label, from: m.fmt!((before as Record<string, unknown>)[m.key]), to: m.fmt!(input[m.key]) }))

  await recordAudit(db, {
    orgId, actorId: userId, action: "UPDATE", table: "listings", recordId: listingId,
    after: { action: "listing_updated", changed: changes.map((c) => c.label) },
  })

  let notified = 0
  if (changes.length > 0) {
    // Live submitted applicants (not already declined) get told what changed.
    const { data: apps, error: appsErr } = await db.from("applications")
      .select("id").eq("listing_id", listingId).eq("org_id", orgId)
      .eq("stage1_consent_given", true).neq("stage1_status", "not_shortlisted")
    if (appsErr) console.error("updateListingAction notify query:", appsErr.message)
    for (const a of apps ?? []) {
      const ctx = await buildEmailContext(a.id as string)
      if (ctx) { try { await sendListingUpdated(ctx.appSummary, ctx.listingSummary, ctx.orgContext, { changes }) } catch (e) { console.error("sendListingUpdated failed:", e) } }
    }
    notified = apps?.length ?? 0
  }

  revalidatePath("/listings")
  return { ok: true, notified }
}

export async function deleteListingAction(listingId: string) {
  const gw = await requireAgentWriteAccess("delete_listing")
  const { db, userId, orgId } = gw

  const { data: apps, error: aErr } = await db.from("applications")
    .select("id").eq("listing_id", listingId).eq("org_id", orgId).eq("stage1_consent_given", true)
  if (aErr) return { error: aErr.message }
  const submitted = apps ?? []

  // Decline + neutrally notify every submitted applicant (reuses the audited Stage-1 decline path).
  for (const a of submitted) {
    await declineStage1Action(a.id as string, "not_shortlisted_property_withdrawn")
  }

  if (submitted.length > 0) {
    // Never hard-delete a listing that has real applications — archive it; the (now declined) application
    // records are retained for the file.
    const { error } = await db.from("listings").update({ status: "expired" }).eq("id", listingId).eq("org_id", orgId)
    if (error) return { error: error.message }
    await recordAudit(db, {
      orgId, actorId: userId, action: "UPDATE", table: "listings", recordId: listingId,
      after: { action: "listing_withdrawn", declined_applications: submitted.length },
    })
  } else {
    // No submissions (e.g. a test listing) → safe to remove entirely.
    const { error } = await db.from("listings").delete().eq("id", listingId).eq("org_id", orgId)
    if (error) return { error: error.message }
    await recordAudit(db, { orgId, actorId: userId, action: "DELETE", table: "listings", recordId: listingId, before: { action: "listing_deleted" } })
  }

  revalidatePath("/listings")
  return { ok: true, declined: submitted.length, archived: submitted.length > 0 }
}
