"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { sendWhatsAppMessage } from "./provider"

type Db = Awaited<ReturnType<typeof createServiceClient>>

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface SendWhatsAppParams {
  leaseId: string
  templateKey: string
  mergeContext: Record<string, string>
  orgId: string
  orgTier: string
  tenantId: string
  toPhone: string
  toneVariant?: "friendly" | "professional" | "firm"
  sentByUserId?: string
}

export interface SendWhatsAppResult {
  sent: boolean
  messageId?: string
  skipped?: boolean
  skipReason?: string
  error?: string
}

// ── Pre-send eligibility check ────────────────────────────────────────────────

interface EligibilityResult {
  skip?: SendWhatsAppResult
  isOverQuota: boolean
  sentWithinCsWindow: boolean
  period: string
}

async function checkSendEligibility(
  db: Db,
  tenantId: string,
  orgId: string,
  leaseId: string,
  templateId: string,
): Promise<EligibilityResult> {
  const period = getPeriodDate()

  const { data: consent, error: consentErr } = await db
    .from("tenant_messaging_consent")
    .select("whatsapp_enabled")
    .eq("tenant_id", tenantId)
    .single()
  if (consentErr && consentErr.code !== "PGRST116") {
    console.error("[sendWhatsApp] consent load error", consentErr)
  }
  if (consent?.whatsapp_enabled === false) {
    return { skip: { sent: false, skipped: true, skipReason: "Tenant has opted out of WhatsApp" }, isOverQuota: false, sentWithinCsWindow: false, period }
  }

  const { data: pref, error: prefErr } = await db
    .from("org_whatsapp_template_preferences")
    .select("opted_in")
    .eq("org_id", orgId)
    .eq("template_id", templateId)
    .single()
  if (prefErr && prefErr.code !== "PGRST116") {
    console.error("[sendWhatsApp] pref load error", prefErr)
  }
  if (pref?.opted_in === false) {
    return { skip: { sent: false, skipped: true, skipReason: "Org has disabled this template" }, isOverQuota: false, sentWithinCsWindow: false, period }
  }

  const { data: usage, error: usageErr } = await db
    .from("messaging_usage")
    .select("whatsapp_count, quota_whatsapp")
    .eq("org_id", orgId)
    .eq("period", period)
    .single()
  if (usageErr && usageErr.code !== "PGRST116") {
    console.error("[sendWhatsApp] usage load error", usageErr)
  }
  const isOverQuota = usage ? usage.whatsapp_count >= usage.quota_whatsapp : false

  const { data: csWindow, error: csErr } = await db
    .from("whatsapp_cs_windows")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .single()
  if (csErr && csErr.code !== "PGRST116") {
    console.error("[sendWhatsApp] cs window load error", csErr)
  }

  return { isOverQuota, sentWithinCsWindow: Boolean(csWindow), period }
}

// ── Main action ────────────────────────────────────────────────────────────────

export async function sendWhatsApp(params: SendWhatsAppParams): Promise<SendWhatsAppResult> {
  const {
    leaseId,
    templateKey,
    mergeContext,
    orgId,
    orgTier,
    tenantId,
    toPhone,
    toneVariant = "professional",
    sentByUserId,
  } = params

  // 1. Owner tier guard — WhatsApp not available on free Owner tier
  if (orgTier === "owner") {
    return { sent: false, skipped: true, skipReason: "WhatsApp not available on Owner tier" }
  }

  const db = await createServiceClient()

  // 2. Load template
  const { data: template, error: templateErr } = await db
    .from("document_templates")
    .select("id, name, meta_template_id, meta_template_status, body_variants, whatsapp_body, merge_fields, whatsapp_meta_variable_map")
    .eq("template_type", "whatsapp")
    .eq("name", templateKey)
    .single()

  if (templateErr) {
    console.error("[sendWhatsApp] template load error", templateErr)
    return { sent: false, error: "Template not found" }
  }

  if (!template) {
    return { sent: false, error: "Template not found" }
  }

  if (template.meta_template_status !== "approved") {
    return { sent: false, skipped: true, skipReason: `Template not approved (status: ${template.meta_template_status ?? "none"})` }
  }

  // 3–6. Consent, preference, quota, and CS window checks
  const eligibility = await checkSendEligibility(db, tenantId, orgId, leaseId, template.id)
  if (eligibility.skip) return eligibility.skip
  const { isOverQuota, sentWithinCsWindow, period } = eligibility

  // 7. Resolve tone variant body
  const resolvedBody = resolveToneBody(template, toneVariant)
  if (!resolvedBody) {
    return { sent: false, error: "No message body found for template" }
  }

  // 8. Build meta template name
  const slug = slugify(template.name)
  const metaTemplateName = `pleks_${slug}_${toneVariant}`

  // 9. Build positional parameters from variable map
  const parameters = buildParameters(template.whatsapp_meta_variable_map, mergeContext)

  // 10. Send via provider
  const sendResult = await sendWhatsAppMessage({
    to: toPhone,
    templateName: metaTemplateName,
    parameters,
    orgId,
    leaseId,
  })

  const now = new Date().toISOString()
  const status = sendResult.error ? "failed" : "submitted"

  // 11. Insert whatsapp_messages row
  const { data: waMsg, error: waMsgErr } = await db
    .from("whatsapp_messages")
    .insert({
      org_id: orgId,
      lease_id: leaseId,
      tenant_id: tenantId,
      direction: "outbound",
      template_id: template.id,
      tone_variant: toneVariant,
      phone_number: toPhone,
      message_body: resolvedBody,
      merge_context: mergeContext,
      provider: "africastalking",
      provider_message_id: sendResult.messageId ?? null,
      meta_template_name: metaTemplateName,
      status,
      failure_reason: sendResult.error ?? null,
      sent_within_cs_window: sentWithinCsWindow,
      submitted_at: now,
    })
    .select("id")
    .single()

  if (waMsgErr) {
    console.error("[sendWhatsApp] whatsapp_messages insert error", waMsgErr)
  }

  // 12. Insert communication_log row
  const { data: logRow, error: logErr } = await db
    .from("communication_log")
    .insert({
      org_id: orgId,
      tenant_id: tenantId,
      lease_id: leaseId,
      channel: "whatsapp",
      direction: "outbound",
      subject: template.name,
      body: resolvedBody,
      status: mapStatusForLog(status),
      external_id: sendResult.messageId ?? null,
      sent_by: sentByUserId ?? null,
      sent_to_phone: toPhone,
    })
    .select("id")
    .single()

  if (logErr) {
    console.error("[sendWhatsApp] communication_log insert error", logErr)
  }

  // 13. Update whatsapp_messages.communication_log_id
  if (waMsg?.id && logRow?.id) {
    const { error: updateErr } = await db
      .from("whatsapp_messages")
      .update({ communication_log_id: logRow.id })
      .eq("id", waMsg.id)

    if (updateErr) {
      console.error("[sendWhatsApp] communication_log_id update error", updateErr)
    }
  }

  // 14. Increment messaging_usage counters
  await incrementUsage(db, orgId, period, isOverQuota)

  if (sendResult.error) {
    return { sent: false, error: sendResult.error }
  }

  return { sent: true, messageId: sendResult.messageId }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getPeriodDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
}

function resolveToneBody(
  template: { body_variants?: unknown; whatsapp_body?: string | null },
  tone: string,
): string | null {
  if (template.body_variants && typeof template.body_variants === "object") {
    const variants = template.body_variants as Record<string, string>
    if (variants[tone]) return variants[tone]
  }
  return template.whatsapp_body ?? null
}

function buildParameters(
  variableMap: unknown,
  mergeContext: Record<string, string>,
): string[] {
  if (!variableMap || typeof variableMap !== "object") return []

  const map = variableMap as Record<string, { index: number; merge_field: string }>
  const entries = Object.entries(map).sort((a, b) => a[1].index - b[1].index)
  return entries.map(([, entry]) => mergeContext[entry.merge_field] ?? "")
}

function mapStatusForLog(status: string): string {
  if (status === "submitted") return "sent"
  if (status === "failed") return "failed"
  return status
}

async function incrementUsage(db: Db, orgId: string, period: string, isOverQuota: boolean): Promise<void> {
  const { data: existing, error: fetchErr } = await db
    .from("messaging_usage")
    .select("whatsapp_count, overage_whatsapp, overage_cents")
    .eq("org_id", orgId)
    .eq("period", period)
    .single()

  if (fetchErr && fetchErr.code !== "PGRST116") {
    console.error("[sendWhatsApp] usage fetch error", fetchErr)
    return
  }

  const updateData: Record<string, unknown> = { last_updated: new Date().toISOString() }

  if (existing) {
    updateData.whatsapp_count = existing.whatsapp_count + 1
    if (isOverQuota) {
      updateData.overage_whatsapp = (existing.overage_whatsapp ?? 0) + 1
      // R0.15 overage per message (15 cents)
      updateData.overage_cents = (existing.overage_cents ?? 0) + 15
    }
  } else {
    updateData.org_id = orgId
    updateData.period = period
    updateData.whatsapp_count = 1
    updateData.overage_whatsapp = isOverQuota ? 1 : 0
    updateData.overage_cents = isOverQuota ? 15 : 0
  }

  const { error: upsertErr } = await db
    .from("messaging_usage")
    .upsert(updateData, { onConflict: "org_id,period" })

  if (upsertErr) {
    console.error("[sendWhatsApp] usage upsert error", upsertErr)
  }
}
