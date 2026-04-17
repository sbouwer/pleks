import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { verifyWebhookSignature, parseWebhookEvent } from "@/lib/messaging/whatsapp/provider"
import { sendSmsFallback } from "@/lib/messaging/whatsapp/sms-fallback"

// STOP keywords per WhatsApp Business Policy
const STOP_KEYWORDS = ["STOP", "OPTOUT", "OPT OUT", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]

type Db = Awaited<ReturnType<typeof createServiceClient>>

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Read raw body for HMAC verification
  const rawBody = await req.text()

  // 2. Verify signature
  const signature = req.headers.get("x-at-signature") ?? req.headers.get("x-hub-signature-256") ?? ""
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  // 3. Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // 4. Parse event
  const event = parseWebhookEvent(parsed)

  // 5. Handle event — always return 200 to prevent AT retries
  try {
    const db = await createServiceClient()

    if (event.type === "delivery_status") {
      await handleDeliveryStatus(db, event.messageId, event.status, event.failureReason)
    } else if (event.type === "inbound_message" && event.inbound) {
      await handleInboundMessage(db, event.inbound.from, event.inbound.body, event.inbound.messageId)
    } else if (event.type === "template_approval" && event.templateApproval) {
      await handleTemplateApproval(
        db,
        event.templateApproval.templateName,
        event.templateApproval.status,
        event.templateApproval.rejectionReason,
      )
    }
  } catch (err) {
    console.error("[wa-webhook] unhandled error", err)
    // Still return 200 — we don't want AT to keep retrying
  }

  return NextResponse.json({ ok: true })
}

// ── Delivery status handler ────────────────────────────────────────────────────

async function handleDeliveryStatus(
  db: Db,
  providerMessageId: string | undefined,
  status: string | undefined,
  failureReason: string | undefined,
): Promise<void> {
  if (!providerMessageId || !status) return

  const now = new Date().toISOString()
  const update = buildDeliveryUpdate(status, failureReason, now)

  const { data: waMsg, error: waErr } = await db
    .from("whatsapp_messages")
    .update(update)
    .eq("provider_message_id", providerMessageId)
    .select("id, org_id, phone_number, message_body, communication_log_id")
    .single()

  if (waErr) {
    console.error("[wa-webhook] delivery update error", waErr)
    return
  }

  if (!waMsg) return

  // Update communication_log status
  if (waMsg.communication_log_id) {
    const logStatus = mapDeliveryStatusToLog(status)
    const { error: logErr } = await db
      .from("communication_log")
      .update({ status: logStatus })
      .eq("id", waMsg.communication_log_id)

    if (logErr) {
      console.error("[wa-webhook] communication_log update error", logErr)
    }
  }

  // Trigger SMS fallback on failure if org has it enabled
  if (status === "failed") {
    await maybeSendSmsFallback(db, waMsg.org_id, waMsg.id, waMsg.phone_number, waMsg.message_body)
  }
}

function buildDeliveryUpdate(
  status: string,
  failureReason: string | undefined,
  now: string,
): Record<string, unknown> {
  const update: Record<string, unknown> = { status }

  if (status === "sent") {
    update.sent_at = now
  } else if (status === "delivered") {
    update.delivered_at = now
  } else if (status === "read") {
    update.read_at = now
  } else if (status === "failed") {
    update.failed_at = now
    update.failure_reason = failureReason ?? "Unknown failure"
  }

  return update
}

function mapDeliveryStatusToLog(status: string): string {
  if (status === "delivered") return "delivered"
  if (status === "read") return "read"
  if (status === "failed") return "failed"
  return "sent"
}

async function maybeSendSmsFallback(
  db: Db,
  orgId: string,
  waMessageId: string,
  phone: string,
  body: string,
): Promise<void> {
  const { data: org, error: orgErr } = await db
    .from("organisations")
    .select("settings")
    .eq("id", orgId)
    .single()

  if (orgErr) {
    console.error("[wa-webhook] org settings load error", orgErr)
    return
  }

  const settings = (org?.settings ?? {}) as Record<string, unknown>
  const communication = (settings.communication ?? {}) as Record<string, unknown>

  if (communication.sms_fallback_enabled === true) {
    await sendSmsFallback(waMessageId, orgId, phone, body)
  }
}

// ── Phone normalization ───────────────────────────────────────────────────────

/** Normalise SA mobile number to E.164 (+27XXXXXXXXX) for contact_phones lookup */
function normalizeSaPhone(phone: string): string {
  const cleaned = phone.replaceAll(/[\s-]/g, "")
  if (cleaned.startsWith("+27")) return cleaned
  if (cleaned.startsWith("0")) return "+27" + cleaned.slice(1)
  if (cleaned.startsWith("27") && !cleaned.startsWith("+")) return "+" + cleaned
  return phone
}

// ── Inbound message handler ────────────────────────────────────────────────────

/** Two-step phone → tenant lookup via contact_phones */
async function lookupTenantByPhone(
  db: Db,
  fromPhone: string,
): Promise<{ id: string; org_id: string } | null> {
  const normalized = normalizeSaPhone(fromPhone)

  const { data: cp, error: cpErr } = await db
    .from("contact_phones")
    .select("contact_id")
    .eq("number", normalized)
    .limit(1)
    .single()

  if (cpErr && cpErr.code !== "PGRST116") {
    console.error("[wa-webhook] contact_phones lookup error", cpErr)
    return null
  }
  if (!cp) {
    console.warn("[wa-webhook] no contact found for phone", normalized)
    return null
  }

  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .select("id, org_id")
    .eq("contact_id", cp.contact_id)
    .limit(1)
    .single()

  if (tErr && tErr.code !== "PGRST116") {
    console.error("[wa-webhook] tenant lookup error", tErr)
    return null
  }
  if (!tenant) {
    console.warn("[wa-webhook] no tenant found for contact_id", cp.contact_id)
    return null
  }

  return tenant
}

/** Insert wa_message + communication_log rows and cross-link them */
async function logInboundMessage(
  db: Db,
  tenant: { id: string; org_id: string },
  leaseId: string | null,
  fromPhone: string,
  body: string,
  providerMsgId: string,
): Promise<string | undefined> {
  const now = new Date().toISOString()

  const { data: waMsg, error: waErr } = await db
    .from("whatsapp_messages")
    .insert({
      org_id: tenant.org_id,
      lease_id: leaseId,
      tenant_id: tenant.id,
      direction: "inbound",
      phone_number: fromPhone,
      message_body: body,
      provider: "africastalking",
      provider_message_id: providerMsgId,
      status: "received",
      submitted_at: now,
    })
    .select("id")
    .single()

  if (waErr) console.error("[wa-webhook] inbound wa_messages insert error", waErr)

  const { data: logRow, error: logErr } = await db
    .from("communication_log")
    .insert({
      org_id: tenant.org_id,
      tenant_id: tenant.id,
      lease_id: leaseId,
      channel: "whatsapp",
      direction: "inbound",
      body,
      status: "received",
      external_id: providerMsgId,
      sent_to_phone: fromPhone,
    })
    .select("id")
    .single()

  if (logErr) console.error("[wa-webhook] inbound communication_log insert error", logErr)

  if (waMsg?.id && logRow?.id) {
    const { error: linkErr } = await db
      .from("whatsapp_messages")
      .update({ communication_log_id: logRow.id })
      .eq("id", waMsg.id)
    if (linkErr) console.error("[wa-webhook] communication_log_id link error", linkErr)
  }

  return waMsg?.id
}

async function handleInboundMessage(
  db: Db,
  fromPhone: string,
  body: string,
  providerMsgId: string,
): Promise<void> {
  const tenant = await lookupTenantByPhone(db, fromPhone)
  if (!tenant) return

  const { data: lease, error: leaseErr } = await db
    .from("leases")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("status", "active")
    .limit(1)
    .single()

  if (leaseErr && leaseErr.code !== "PGRST116") {
    console.error("[wa-webhook] lease lookup error", leaseErr)
  }

  const waMsgId = await logInboundMessage(db, tenant, lease?.id ?? null, fromPhone, body, providerMsgId)

  if (lease?.id) {
    await openCsWindow(db, lease.id, tenant.id, waMsgId)
  }

  if (isStopKeyword(body)) {
    await revokeWhatsAppConsent(db, tenant.id, tenant.org_id, fromPhone)
  }
}

function isStopKeyword(body: string): boolean {
  const upper = body.trim().toUpperCase()
  return STOP_KEYWORDS.some((kw) => upper === kw || upper.startsWith(kw + " "))
}

async function openCsWindow(
  db: Db,
  leaseId: string,
  tenantId: string,
  triggerMessageId: string | undefined,
): Promise<void> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Deactivate any existing window first
  await db
    .from("whatsapp_cs_windows")
    .update({ is_active: false })
    .eq("lease_id", leaseId)
    .eq("is_active", true)

  const { error } = await db.from("whatsapp_cs_windows").insert({
    lease_id: leaseId,
    tenant_id: tenantId,
    opened_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    trigger_message_id: triggerMessageId ?? null,
    is_active: true,
  })

  if (error) {
    console.error("[wa-webhook] cs_window insert error", error)
  }
}

async function revokeWhatsAppConsent(
  db: Db,
  tenantId: string,
  orgId: string,
  phone: string,
): Promise<void> {
  const { error: consentErr } = await db
    .from("tenant_messaging_consent")
    .upsert(
      {
        tenant_id: tenantId,
        org_id: orgId,
        whatsapp_enabled: false,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    )

  if (consentErr) {
    console.error("[wa-webhook] consent revoke error", consentErr)
  }

  // Audit log — action must be one of INSERT/UPDATE/DELETE; changed_by must be UUID or null
  const { error: auditErr } = await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "tenant_messaging_consent",
    record_id: tenantId,
    action: "UPDATE",
    changed_by: null,
    new_values: { whatsapp_enabled: false, triggered_by_stop_keyword: true, phone },
  })

  if (auditErr) {
    console.error("[wa-webhook] audit_log insert error", auditErr)
  }
}

// ── Template approval handler ──────────────────────────────────────────────────

async function handleTemplateApproval(
  db: Db,
  templateName: string,
  status: string,
  rejectionReason: string | undefined,
): Promise<void> {
  if (!templateName) return

  const approvalStatus = mapTemplateApprovalStatus(status)
  const update: Record<string, unknown> = {
    meta_template_status: approvalStatus,
  }

  if (approvalStatus === "approved") {
    update.whatsapp_meta_approved_at = new Date().toISOString()
  } else if (approvalStatus === "rejected") {
    update.whatsapp_meta_rejection_reason = rejectionReason ?? "No reason provided"
  }

  const { error } = await db
    .from("document_templates")
    .update(update)
    .eq("meta_template_name", templateName)

  if (error) {
    console.error("[wa-webhook] template approval update error", error)
  }
}

function mapTemplateApprovalStatus(status: string): "pending" | "approved" | "rejected" {
  const lower = status.toLowerCase()
  if (lower === "approved") return "approved"
  if (lower === "rejected") return "rejected"
  return "pending"
}
