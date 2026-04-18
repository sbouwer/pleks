"use server"

import { randomBytes } from "node:crypto"
import { gateway } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { sendInfoRequestEmail } from "@/lib/info-requests/sendInfoRequestEmail"

// ── Types ─────────────────────────────────────────────────────────────────────

export type InfoRequestTopic =
  | "landlord" | "insurance" | "broker" | "scheme"
  | "banking"  | "documents" | "compliance" | "other"

export type InfoRequestRecipientType = "owner" | "broker" | "self"

export interface CreateInfoRequestParams {
  propertyId:      string
  topic:           InfoRequestTopic
  missingFields:   string[]
  recipientType:   InfoRequestRecipientType
  recipientEmail?: string | null
  recipientPhone?: string | null
  recipientContactId?: string | null
  scenarioContext?: Record<string, unknown>
  requestedBy:     string
  orgId:           string
  expiresAt:       string  // ISO timestamp
}

export interface InfoRequestResult {
  ok:        boolean
  requestId?: string
  error?:    string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(32).toString("hex")
}

// ── Internal create (callable by other server actions or routes) ─────────────

export async function createPropertyInfoRequest(
  params: CreateInfoRequestParams,
): Promise<InfoRequestResult> {
  // Auth check — this file has "use server", so without this any signed-in
  // user could call it with another org's IDs and trigger emails on their behalf.
  // The wizard save action calls us in the same request; cookies/session carry
  // through nested server-action calls in Next 14, so gateway() resolves here too.
  const gw = await gateway()
  if (!gw)                            return { ok: false, error: "Not authenticated" }
  if (gw.orgId !== params.orgId)      return { ok: false, error: "Org mismatch" }
  if (gw.userId !== params.requestedBy) return { ok: false, error: "Requester mismatch" }

  const service = await createServiceClient()
  const token = generateToken()

  const { data: existingPending } = await service
    .from("property_info_requests")
    .select("id")
    .eq("property_id", params.propertyId)
    .eq("topic", params.topic)
    .in("status", ["pending", "sent"])
    .limit(1)
    .maybeSingle()

  if (existingPending) {
    // De-dup: an open request already exists. Don't create a duplicate.
    return { ok: true, requestId: existingPending.id as string }
  }

  const { data: req, error } = await service.from("property_info_requests").insert({
    org_id:                params.orgId,
    property_id:           params.propertyId,
    topic:                 params.topic,
    missing_fields:        params.missingFields,
    recipient_type:        params.recipientType,
    recipient_contact_id:  params.recipientContactId ?? null,
    recipient_email:       params.recipientEmail ?? null,
    recipient_phone:       params.recipientPhone ?? null,
    requested_by:          params.requestedBy,
    token,
    status:                "pending",
    scenario_context:      params.scenarioContext ?? {},
    expires_at:            params.expiresAt,
  }).select("id").single()

  if (error || !req) {
    console.error("createPropertyInfoRequest: insert failed:", error?.message)
    return { ok: false, error: error?.message ?? "Failed to create info request" }
  }

  // Audit event
  await service.from("property_info_request_events").insert({
    request_id:    req.id,
    event_type:    "created",
    actor_user_id: params.requestedBy,
    payload:       { topic: params.topic, missingFields: params.missingFields },
  })

  // For owner / broker tracks with an email, send immediately
  if (
    (params.recipientType === "owner" || params.recipientType === "broker") &&
    params.recipientEmail
  ) {
    const sendResult = await sendInfoRequestEmail({
      orgId:           params.orgId,
      requestId:       req.id as string,
      topic:           params.topic,
      recipientEmail:  params.recipientEmail,
      token,
      propertyId:      params.propertyId,
    })

    if (sendResult.ok) {
      await service.from("property_info_requests")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", req.id)

      await service.from("property_info_request_events").insert({
        request_id:           req.id,
        event_type:           "email_sent",
        channel:              "email",
        communication_log_id: sendResult.logId ?? null,
        actor_user_id:        params.requestedBy,
      })
    } else {
      await service.from("property_info_requests")
        .update({ status: "failed" })
        .eq("id", req.id)

      await service.from("property_info_request_events").insert({
        request_id:    req.id,
        event_type:    "email_sent",     // attempted, not delivered
        channel:       "email",
        actor_user_id: params.requestedBy,
        payload:       { error: sendResult.error ?? "Unknown send error" },
      })
    }
  }

  revalidatePath(`/properties/${params.propertyId}`)
  return { ok: true, requestId: req.id as string }
}

// ── User-facing wrapper (called from completeness widget UI) ─────────────────

export interface UiCreateInfoRequestParams {
  propertyId:    string
  topic:         InfoRequestTopic
  missingFields: string[]
  recipientType: InfoRequestRecipientType
  recipientEmail?: string | null
  expiresInDays?: number
}

export async function createInfoRequestFromWidget(
  params: UiCreateInfoRequestParams,
): Promise<InfoRequestResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { userId, orgId } = gw

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + (params.expiresInDays ?? 14))

  return createPropertyInfoRequest({
    propertyId:     params.propertyId,
    topic:          params.topic,
    missingFields:  params.missingFields,
    recipientType:  params.recipientType,
    recipientEmail: params.recipientEmail ?? null,
    requestedBy:    userId,
    orgId,
    expiresAt:      expiresAt.toISOString(),
  })
}

// ── Send a reminder ──────────────────────────────────────────────────────────

export async function sendInfoRequestReminder(requestId: string): Promise<InfoRequestResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { userId, orgId } = gw

  const service = await createServiceClient()

  const { data: req, error } = await service
    .from("property_info_requests")
    .select("id, property_id, org_id, topic, recipient_type, recipient_email, token, status, reminder_count")
    .eq("id", requestId)
    .single()

  if (error || !req) return { ok: false, error: "Request not found" }
  if ((req.org_id as string) !== orgId) return { ok: false, error: "Not authorized" }
  if (!["pending", "sent"].includes(req.status as string)) {
    return { ok: false, error: `Cannot remind on ${req.status} request` }
  }
  if (!req.recipient_email) return { ok: false, error: "No email on record" }

  const sendResult = await sendInfoRequestEmail({
    orgId,
    requestId:      req.id as string,
    topic:          req.topic as InfoRequestTopic,
    recipientEmail: req.recipient_email as string,
    token:          req.token as string,
    propertyId:     req.property_id as string,
    isReminder:     true,
    reminderCount:  (req.reminder_count as number ?? 0) + 1,
  })

  if (sendResult.ok) {
    // Read-then-write counter increment. Race-safe enough for reminder_count
    // (worst case: a tied increment loses by 1 — not load-bearing).
    const { data: current } = await service
      .from("property_info_requests")
      .select("reminder_count")
      .eq("id", req.id)
      .single()
    const nextCount = (current?.reminder_count as number ?? 0) + 1

    await service.from("property_info_requests")
      .update({
        last_reminder_at: new Date().toISOString(),
        reminder_count:   nextCount,
      })
      .eq("id", req.id)

    await service.from("property_info_request_events").insert({
      request_id:           req.id,
      event_type:           "email_reminder_sent",
      channel:              "email",
      communication_log_id: sendResult.logId ?? null,
      actor_user_id:        userId,
    })
  }

  revalidatePath(`/properties/${req.property_id}`)
  return { ok: sendResult.ok, requestId: req.id as string, error: sendResult.error }
}

// ── Dismiss a request (mark as not-needed) ────────────────────────────────────

export async function dismissInfoRequest(requestId: string): Promise<InfoRequestResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { userId, orgId } = gw

  const service = await createServiceClient()
  const { data: req } = await service
    .from("property_info_requests")
    .select("id, property_id, org_id")
    .eq("id", requestId)
    .single()

  if (!req || (req.org_id as string) !== orgId) return { ok: false, error: "Not authorized" }

  await service.from("property_info_requests")
    .update({ status: "dismissed" })
    .eq("id", requestId)

  await service.from("property_info_request_events").insert({
    request_id:    requestId,
    event_type:    "dismissed",
    actor_user_id: userId,
  })

  revalidatePath(`/properties/${req.property_id}`)
  return { ok: true, requestId }
}
