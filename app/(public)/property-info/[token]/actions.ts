"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/comms/send-email"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubmitPayload {
  token:        string
  consentGiven: boolean
  /** Flat key/value map — keys are the missing_fields from the request */
  values:       Record<string, string | null>
}

export interface SubmitResult {
  ok:    boolean
  error?: string
}

// ── Field writebacks per topic ────────────────────────────────────────────────
// Each topic maps specific form fields back to property / landlord / scheme columns.

type Writeback = (
  service: Awaited<ReturnType<typeof createServiceClient>>,
  propertyId: string,
  values: Record<string, string | null>,
) => Promise<void>

async function writebackInsurance(service: Awaited<ReturnType<typeof createServiceClient>>, propertyId: string, values: Record<string, string | null>) {
  const update: Record<string, unknown> = {}
  if (values.insurance_provider)              update.insurance_provider              = values.insurance_provider
  if (values.insurance_policy_number)         update.insurance_policy_number         = values.insurance_policy_number
  if (values.insurance_renewal_date)          update.insurance_renewal_date          = values.insurance_renewal_date
  if (values.insurance_replacement_value_cents) {
    const n = Number.parseFloat(values.insurance_replacement_value_cents)
    if (!Number.isNaN(n)) update.insurance_replacement_value_cents = Math.round(n * 100)
  }
  if (Object.keys(update).length > 0) {
    await service.from("properties").update(update).eq("id", propertyId)
  }
}

async function writebackLandlord(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  propertyId: string,
  values: Record<string, string | null>,
) {
  const { data: property } = await service
    .from("properties")
    .select("org_id, landlord_id")
    .eq("id", propertyId)
    .single()
  if (!property) return

  // Create contact + landlord if not already linked
  if (!property.landlord_id) {
    const isOrg = values.entity_type === "company" || values.entity_type === "trust"
    const { data: contact } = await service.from("contacts").insert({
      org_id:        property.org_id,
      entity_type:   isOrg ? "organisation" : "individual",
      primary_role:  "landlord",
      first_name:    values.first_name || null,
      last_name:     values.last_name || null,
      company_name:  values.company_name || null,
      primary_email: values.email || null,
      primary_phone: values.phone || null,
    }).select("id").single()
    if (!contact) return

    const { data: landlord } = await service.from("landlords").insert({
      org_id:     property.org_id,
      contact_id: contact.id,
    }).select("id").single()
    if (!landlord) return

    await service.from("properties")
      .update({ landlord_id: landlord.id })
      .eq("id", propertyId)
  }
}

async function writebackScheme(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  propertyId: string,
  values: Record<string, string | null>,
) {
  const { data: property } = await service
    .from("properties")
    .select("managing_scheme_id")
    .eq("id", propertyId)
    .single()
  if (!property?.managing_scheme_id) return

  const update: Record<string, unknown> = {}
  if (values.scheme_name)           update.name                  = values.scheme_name
  if (values.managing_agent_name)   update.managing_agent_name   = values.managing_agent_name
  if (values.managing_agent_email)  update.managing_agent_email  = values.managing_agent_email
  if (values.managing_agent_phone)  update.managing_agent_phone  = values.managing_agent_phone
  if (Object.keys(update).length > 0) {
    await service.from("managing_schemes")
      .update(update)
      .eq("id", property.managing_scheme_id)
  }
}

async function writebackBanking(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  propertyId: string,
  values: Record<string, string | null>,
) {
  const { data: property } = await service
    .from("properties")
    .select("landlord_id")
    .eq("id", propertyId)
    .single()
  if (!property?.landlord_id) return

  const update: Record<string, unknown> = {}
  if (values.bank_name)           update.bank_name   = values.bank_name
  if (values.bank_account_number) update.bank_account = values.bank_account_number
  if (values.bank_branch_code)    update.bank_branch = values.bank_branch_code
  if (Object.keys(update).length > 0) {
    await service.from("landlords")
      .update(update)
      .eq("id", property.landlord_id)
  }
}

async function writebackNotes(
  _service: Awaited<ReturnType<typeof createServiceClient>>,
  _propertyId: string,
  _values: Record<string, string | null>,
) {
  // Generic topics (broker, compliance, documents, other) store free-form notes
  // on the request payload — nothing to writeback to the property here. The
  // requesting user sees the notes in the completion event payload.
}

const WRITEBACKS: Record<string, Writeback | undefined> = {
  insurance:  writebackInsurance,
  landlord:   writebackLandlord,
  scheme:     writebackScheme,
  banking:    writebackBanking,
  broker:     writebackNotes,
  compliance: writebackNotes,
  documents:  writebackNotes,
  other:      writebackNotes,
}

/**
 * Free-form topics (notes textarea only, no target table). The submitted
 * text MUST be preserved in the completion event payload — without this the
 * owner's broker / compliance notes would be lost on submit.
 */
const FREE_FORM_TOPICS = new Set(["broker", "compliance", "documents", "other"])

// ── Requester notification (GAP 3 fix — agent gets "owner replied" email) ────

interface RequestRowForNotify {
  id:           string
  org_id:       string
  property_id:  string
  topic:        string
  requested_by: string
}

async function notifyRequester(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  req: RequestRowForNotify,
): Promise<void> {
  // Fetch requesting user's email + name
  const { data: user } = await service
    .from("user_profiles")
    .select("full_name")
    .eq("id", req.requested_by)
    .maybeSingle()

  const { data: authUser } = await service.auth.admin.getUserById(req.requested_by)
  const email = authUser?.user?.email ?? null
  if (!email) return   // No email on file — skip silently (log is already recorded)

  const { data: property } = await service
    .from("properties")
    .select("name")
    .eq("id", req.property_id)
    .maybeSingle()

  const propertyName = property?.name ?? "your property"
  const agentName    = (user?.full_name as string) ?? "there"
  const baseUrl      = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://pleks.co.za"
  const link         = `${baseUrl}/properties/${req.property_id}`

  const topicLabel: Record<string, string> = {
    insurance:  "insurance details",
    landlord:   "owner / landlord details",
    broker:     "broker details",
    scheme:     "managing scheme details",
    banking:    "banking details",
    documents:  "documents",
    compliance: "compliance details",
    other:      "the requested information",
  }
  const label = topicLabel[req.topic] ?? "the requested information"

  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 24px auto; padding: 24px; color: #18181b; line-height: 1.5;">
    <h2 style="margin: 0 0 16px 0; font-size: 18px;">Owner replied</h2>
    <p>Hi ${agentName},</p>
    <p>The owner just submitted the ${label} you requested for <strong>${propertyName}</strong>.</p>
    <p style="margin: 24px 0;">
      <a href="${link}" style="background: #18181b; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: 500;">View property</a>
    </p>
    <p style="font-size: 12px; color: #a1a1aa;">
      Pleks — your property setup progress just moved forward.
    </p>
  </body>
</html>`

  await sendEmail({
    orgId:       req.org_id,
    templateKey: "info_request.completion_notify",
    to:          { email, name: agentName },
    subject:     `Owner replied — ${propertyName}`,
    rawHtml:     html,
    bodyPreview: `The owner submitted ${label} for ${propertyName}. View at ${link}`,
    entityType:  "property_info_request",
    entityId:    req.id,
  })
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function submitPropertyInfo(input: SubmitPayload): Promise<SubmitResult> {
  if (!input.consentGiven) return { ok: false, error: "POPIA consent is required" }
  if (!input.token)        return { ok: false, error: "Missing token" }

  const service = await createServiceClient()

  const { data: req, error } = await service
    .from("property_info_requests")
    .select("id, org_id, property_id, topic, missing_fields, status, expires_at, requested_by")
    .eq("token", input.token)
    .single()

  if (error || !req) return { ok: false, error: "Link not found" }
  if (req.status === "completed" || req.status === "dismissed") {
    return { ok: false, error: "This request has already been closed" }
  }
  if (new Date(req.expires_at as string) < new Date()) {
    await service.from("property_info_requests").update({ status: "expired" }).eq("id", req.id)
    return { ok: false, error: "Link expired" }
  }

  // Filter submitted values to the whitelist of missing_fields only
  const allowed = new Set(req.missing_fields as string[] ?? [])
  const filtered: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(input.values)) {
    if (allowed.has(k) || k === "notes" || k === "entity_type") filtered[k] = v
  }

  // Also record a consent log
  await service.from("consent_log").insert({
    org_id:         req.org_id,
    consent_type:   "property_info_submission",
    consent_version: "1.0",
    given_at:       new Date().toISOString(),
    entity_type:    "property_info_request",
    entity_id:      req.id,
    metadata:       { topic: req.topic },
  }).then(() => null, () => null)   // best-effort; no consent_log schema assumption

  // Writeback
  const writeback = WRITEBACKS[req.topic as string]
  if (writeback) {
    try {
      await writeback(service, req.property_id as string, filtered)
    } catch (err) {
      console.error("submitPropertyInfo writeback failed:", err)
      return { ok: false, error: "Failed to save — please try again or contact the agent" }
    }
  }

  // Mark request complete
  const completedAt = new Date().toISOString()
  await service.from("property_info_requests")
    .update({ status: "completed", completed_at: completedAt })
    .eq("id", req.id)

  // For free-form topics, preserve submitted values in the event payload
  // — the strict-writeback topics (insurance/landlord/scheme/banking) already
  // landed their values on their target tables, so no duplication needed.
  const isFreeForm = FREE_FORM_TOPICS.has(req.topic as string)

  await service.from("property_info_request_events").insert({
    request_id: req.id,
    event_type: "completed",
    payload:    {
      fields_submitted: Object.keys(filtered),
      ...(isFreeForm && { values: filtered }),
    },
  })

  // Notify the requesting agent (best-effort — don't fail submit if email fails)
  await notifyRequester(service, req).catch((e) => {
    console.error("submitPropertyInfo: requester notification failed:", e)
  })

  return { ok: true }
}
