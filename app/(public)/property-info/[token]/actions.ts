"use server"

/**
 * app/(public)/property-info/[token]/actions.ts — server actions backing the public owner info-request form
 *
 * Route:  /property-info/[token] (public, tokenised — no auth session)
 * Auth:   access gated by the opaque request token; uses the service client (RLS-bypassing) scoped by the token's org/property
 * Data:   properties, contacts, landlords, managing_schemes, property_insurance_checklists (Supabase service client)
 * Notes:  writes owner-submitted answers back to the linked property/landlord/scheme columns per topic
 */

import { createServiceClient } from "@/lib/supabase/server"
import { sendInfoRequestCompletionNotify } from "@/lib/info-requests/sendInfoRequestEmail"
import type { InfoRequestTopic } from "@/lib/info-requests/sendInfoRequestEmail"
import { mandatoryGate } from "@/lib/migration/mandatoryGate"

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
  const { data: property, error: propertyError } = await service
    .from("properties")
    .select("org_id, landlord_id")
    .eq("id", propertyId)
    .single()
  if (propertyError) console.error("writebackLandlord properties read failed:", propertyError.message)
  if (!property) return

  // Create contact + landlord if not already linked
  if (!property.landlord_id) {
    const isOrg = values.entity_type === "company" || values.entity_type === "trust"
    // 21E §1: a PUBLIC, unauthenticated owner writeback. It returns void (fire-and-forget), so refusing would
    // silently DROP the owner's submission — worse than tracking it. So RELAX+FLAG: capture whatever they gave and
    // land it on the burn-down for the agent to complete. (Reclassified from "refuse" on inspecting the void contract.)
    const wbContact = {
      first_name:    values.first_name || null,
      last_name:     values.last_name || null,
      company_name:  values.company_name || null,
      primary_email: values.email || null,
      primary_phone: values.phone || null,
    }
    const { data: contact, error: contactError } = await service.from("contacts").insert({
      org_id:        property.org_id,
      entity_type:   isOrg ? "organisation" : "individual",
      primary_role:  "landlord",
      ...wbContact,
      ...mandatoryGate("landlord", wbContact, { relax: true }),
    }).select("id").single()
    if (contactError) console.error("writebackLandlord contacts insert failed:", contactError.message)
    if (!contact) return

    const { data: landlord, error: landlordError } = await service.from("landlords").insert({
      org_id:     property.org_id,
      contact_id: contact.id,
    }).select("id").single()
    if (landlordError) console.error("writebackLandlord landlords insert failed:", landlordError.message)
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
  const { data: property, error: schemePropertyError } = await service
    .from("properties")
    .select("managing_scheme_id")
    .eq("id", propertyId)
    .single()
  if (schemePropertyError) console.error("writebackScheme properties read failed:", schemePropertyError.message)
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
  const { data: property, error: bankingPropertyError } = await service
    .from("properties")
    .select("landlord_id")
    .eq("id", propertyId)
    .single()
  if (bankingPropertyError) console.error("writebackBanking properties read failed:", bankingPropertyError.message)
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

const SUBMITTER_DISPLAY: Record<string, string> = {
  owner:  "The property owner",
  broker: "The insurance broker",
  self:   "You",
}

interface RequestRowForNotify {
  id:             string
  org_id:         string
  property_id:    string
  topic:          string
  requested_by:   string
  recipient_type: string
}

async function notifyRequester(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  req: RequestRowForNotify,
): Promise<void> {
  const { data: authUser } = await service.auth.admin.getUserById(req.requested_by)
  const email = authUser?.user?.email ?? null
  if (!email) return

  await sendInfoRequestCompletionNotify({
    orgId:            req.org_id,
    requestId:        req.id,
    topic:            req.topic as InfoRequestTopic,
    recipientEmail:   email,
    propertyId:       req.property_id,
    submitterDisplay: SUBMITTER_DISPLAY[req.recipient_type] ?? "A third party",
  })
}

// ── Insurance checklist owner-response action ─────────────────────────────────

export interface ChecklistSubmitPayload {
  token:        string
  consentGiven: boolean
  /** item_code → owner answer */
  answers: Record<string, "yes" | "no" | "not_sure">
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>

interface ChecklistItemResult {
  confirmed: number
  uncertain: number
}

async function applyChecklistAnswer(
  service:    ServiceClient,
  propertyId: string,
  itemCode:   string,
  answer:     "yes" | "no" | "not_sure",
): Promise<ChecklistItemResult> {
  const { data: existing, error: existingError } = await service
    .from("property_insurance_checklists")
    .select("id, state")
    .eq("property_id", propertyId)
    .eq("item_code", itemCode)
    .single()
  if (existingError) console.error("applyChecklistAnswer property_insurance_checklists read failed:", existingError.message)

  if (!existing) return { confirmed: 0, uncertain: 0 }

  const priorState = existing.state as string
  const newState: "confirmed" | "unknown" = answer === "yes" ? "confirmed" : "unknown"
  const noteAppend = answer === "not_sure" ? "owner uncertain" : null

  if (priorState !== newState) {
    const now = new Date().toISOString()
    await service
      .from("property_insurance_checklists")
      .update({
        state:         newState,
        confirmed_at:  newState === "confirmed" ? now : null,
        confirmed_by:  null,
        confirmed_via: newState === "confirmed" ? "owner_response" : null,
        ...(noteAppend && { notes: noteAppend }),
      })
      .eq("id", existing.id)

    await service.from("property_insurance_checklist_events").insert({
      checklist_id: existing.id,
      event_type:   newState === "confirmed" ? "confirmed" : "unconfirmed",
      prior_state:  priorState,
      new_state:    newState,
      source:       "owner",
      payload: {
        answer,
        via: "magic_link",
        ...(noteAppend && { note: noteAppend }),
      },
    })
  }

  return {
    confirmed: newState === "confirmed" ? 1 : 0,
    uncertain: newState === "unknown"   ? 1 : 0,
  }
}

export async function submitOwnerChecklistResponse(
  input: ChecklistSubmitPayload,
): Promise<SubmitResult> {
  if (!input.consentGiven) return { ok: false, error: "POPIA consent is required" }
  if (!input.token)        return { ok: false, error: "Missing token" }

  const service = await createServiceClient()

  const { data: req, error } = await service
    .from("property_info_requests")
    .select("id, org_id, property_id, topic, status, expires_at, requested_by, recipient_type")
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

  // POPIA consent log — BLOCKING: a consent register write must not be swallowed (CRITICAL table).
  const { error: consentErr } = await service.from("consent_log").insert({
    org_id:          req.org_id,
    consent_type:    "property_info_submission",
    consent_version: "1.0",
    consent_given:   true,
    metadata:        { topic: "insurance_checklist", entity_type: "property_info_request", entity_id: req.id },
  })
  if (consentErr) {
    console.error("property-info consent_log insert failed:", consentErr.message)
    return { ok: false, error: "Could not record your consent — please try again." }
  }

  let confirmedCount = 0
  let uncertainCount = 0
  const propertyId = req.property_id as string

  for (const [itemCode, answer] of Object.entries(input.answers)) {
    const result = await applyChecklistAnswer(service, propertyId, itemCode, answer)
    confirmedCount += result.confirmed
    uncertainCount += result.uncertain
  }

  // Mark the info-request as completed
  await service
    .from("property_info_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", req.id)

  await service.from("property_info_request_events").insert({
    request_id: req.id,
    event_type: "completed",
    payload: {
      mode:            "insurance_checklist",
      confirmed_count: confirmedCount,
      uncertain_count: uncertainCount,
      total_items:     Object.keys(input.answers).length,
    },
  })

  // Notify the requesting agent (best-effort)
  await notifyRequester(service, req as RequestRowForNotify).catch((e) => {
    console.error("submitOwnerChecklistResponse: requester notification failed:", e)
  })

  return { ok: true }
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function submitPropertyInfo(input: SubmitPayload): Promise<SubmitResult> {
  if (!input.consentGiven) return { ok: false, error: "POPIA consent is required" }
  if (!input.token)        return { ok: false, error: "Missing token" }

  const service = await createServiceClient()

  const { data: req, error } = await service
    .from("property_info_requests")
    .select("id, org_id, property_id, topic, missing_fields, status, expires_at, requested_by, recipient_type")
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

  // Record consent — BLOCKING: a consent register write must not be swallowed (CRITICAL table).
  const { error: consentLogErr } = await service.from("consent_log").insert({
    org_id:         req.org_id,
    consent_type:   "property_info_submission",
    consent_version: "1.0",
    consent_given:  true,
    metadata:       { topic: req.topic, entity_type: "property_info_request", entity_id: req.id },
  })
  if (consentLogErr) {
    console.error("submitPropertyInfo consent_log insert failed:", consentLogErr.message)
    return { ok: false, error: "Could not record your consent — please try again." }
  }

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
  await notifyRequester(service, req as RequestRowForNotify).catch((e) => {
    console.error("submitPropertyInfo: requester notification failed:", e)
  })

  return { ok: true }
}
