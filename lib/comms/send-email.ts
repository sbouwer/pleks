/**
 * lib/comms/send-email.ts — single entry point for all outbound emails
 *
 * Data:   Resend (provider), communication_log (audit), communication_preferences (opt-out)
 * Notes:  Every module calls sendEmail() — never calls Resend directly.
 *         BUILD_63: extended with body_full, template_version_hash, tone_variant,
 *         trigger_event fields, attempt_number, first_attempt_log_id for audit trail.
 *
 * Pipeline:
 *  1. Validate template key
 *  2. Check communication_preferences (skipped for mandatory templates)
 *  3. Fetch org branding
 *  4. Render React Email template with variables + branding
 *  5. Send via Resend
 *  6. Log to communication_log (always — even on failure)
 *  7. Return { success, logId }
 */

import { createHash } from "node:crypto"
import { Resend } from "resend"
import { render } from "@react-email/components"
import { createServiceClient } from "@/lib/supabase/server"
import { getTemplate } from "./template-registry"
import { canSend, ensurePreferences } from "./preferences"
import type { OrgBranding } from "./templates/layout"
export type { OrgBranding } from "./templates/layout"
import type { ReactElement } from "react"

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const DEFAULT_FROM = "Pleks <notifications@pleks.co.za>"
const REPLY_TO_DEFAULT = "no-reply@pleks.co.za"

export interface SendEmailParams {
  orgId: string
  templateKey: string
  to: {
    email: string
    name: string
    contactId?: string
  }
  subject: string
  /** The rendered React Email element (from the template component). Mutually exclusive with rawHtml. */
  emailElement?: ReactElement
  /** Pre-rendered HTML string (for reports/documents). Mutually exclusive with emailElement. */
  rawHtml?: string
  /** Plain-text body preview (first ~200 chars shown in log) */
  bodyPreview?: string
  entityType?: string
  entityId?: string
  triggeredBy?: string       // user ID — omit for cron/system
  replyTo?: string           // defaults to org's configured email
  attachments?: Array<{
    filename: string
    content: string | Buffer  // base64 string or Buffer
    contentType?: string
  }>
  tenantId?: string              // stored in communication_log.tenant_id for portal queries
  // BUILD_63 audit fields
  toneVariant?: "friendly" | "professional" | "firm" | "n/a"
  triggerEventType?: string  // 'arrears_action' | 'invoice_issued' | 'lease_state' | 'cron:*' | 'manual'
  triggerEventId?: string    // UUID of the causing entity
  attemptNumber?: number     // retry chain position (default 1)
  firstAttemptLogId?: string // UUID of the first attempt's log row (retry chains)
  templateCategory?: string  // drives conditional footer sections (e.g. 'maintenance')
}

export interface SendEmailResult {
  success: boolean
  logId?: string
  error?: string
}

interface OrgSettings {
  name: string
  email?: string
  phone?: string
  address?: string
  brand_logo_url?: string
  brand_accent_color?: string
  custom_from_address?: string   // verified custom domain from address
  reply_to_email?: string
  emergency_phone?: string
  emergency_contact_name?: string
}

export async function fetchOrgSettings(orgId: string): Promise<OrgSettings | null> {
  const service = await createServiceClient()
  const { data } = await service
    .from("organisations")
    .select("name, email, phone, address_line1, city, brand_logo_path, brand_accent_color, custom_from_address, notification_settings, emergency_phone, emergency_contact_name")
    .eq("id", orgId)
    .single()
  if (!data) return null

  const logoPath = data.brand_logo_path as string | null
  let brand_logo_url: string | undefined
  if (logoPath) {
    const { data: { publicUrl } } = service.storage.from("org-assets").getPublicUrl(logoPath)
    brand_logo_url = publicUrl
  }

  const notifSettings = data.notification_settings as Record<string, string> | null

  return {
    name: data.name as string,
    email: data.email as string | undefined,
    phone: data.phone as string | undefined,
    address: [data.address_line1, data.city].filter(Boolean).join(", ") || undefined,
    brand_logo_url,
    brand_accent_color: data.brand_accent_color as string | undefined,
    custom_from_address: data.custom_from_address as string | undefined,
    reply_to_email: notifSettings?.reply_to_email,
    emergency_phone: data.emergency_phone as string | undefined,
    emergency_contact_name: data.emergency_contact_name as string | undefined,
  }
}

async function logToDb(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  params: {
    orgId: string
    templateKey: string
    tenantId?: string
    to: SendEmailParams["to"]
    subject: string
    bodyPreview?: string
    bodyFull?: string
    entityType?: string
    entityId?: string
    triggeredBy?: string
    status: "sent" | "failed"
    providerId?: string
    failedReason?: string
    toneVariant?: string
    triggerEventType?: string
    triggerEventId?: string
    attemptNumber?: number
    firstAttemptLogId?: string
  }
): Promise<string> {
  const templateVersionHash = params.bodyFull
    ? createHash("sha256").update(params.bodyFull).digest("hex")
    : null

  const { data: log } = await service
    .from("communication_log")
    .insert({
      org_id: params.orgId,
      direction: "outbound",
      channel: "email",
      tenant_id: params.tenantId ?? null,
      contact_id: params.to.contactId ?? null,
      sent_to_email: params.to.email,
      recipient_name: params.to.name,
      template_key: params.templateKey,
      subject: params.subject,
      body: params.bodyPreview?.slice(0, 200) ?? null,
      body_full: params.bodyFull ?? null,
      template_version_hash: templateVersionHash,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      status: params.status,
      external_id: params.providerId ?? null,
      failed_reason: params.failedReason ?? null,
      triggered_by: params.triggeredBy ?? null,
      tone_variant: params.toneVariant ?? null,
      trigger_event_type: params.triggerEventType ?? null,
      trigger_event_id: params.triggerEventId ?? null,
      attempt_number: params.attemptNumber ?? 1,
      first_attempt_log_id: params.firstAttemptLogId ?? null,
      failed_reason_code: params.failedReason ? deriveFailedReasonCode(params.failedReason) : null,
    })
    .select("id")
    .single()
  return log?.id ?? ""
}

function deriveFailedReasonCode(reason: string): string {
  const r = reason.toLowerCase()
  if (r.includes("hard_bounce") || r.includes("bounced_hard")) return "hard_bounce"
  if (r.includes("soft_bounce") || r.includes("bounced_soft")) return "soft_bounce"
  if (r.includes("suppressed")) return "suppressed"
  if (r.includes("rate_limit") || r.includes("429")) return "rate_limit"
  if (r.includes("no_consent") || r.includes("consent")) return "no_consent"
  if (r.includes("no_channel")) return "no_channel_available"
  return "provider_error"
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const template = getTemplate(params.templateKey)  // throws on unknown key

  // 1. Preference check (mandatory templates always pass)
  const preference = await canSend({
    orgId: params.orgId,
    templateKey: params.templateKey,
    email: params.to.email,
    contactId: params.to.contactId,
  })

  if (!preference.allowed) {
    // Log suppressed send for audit trail
    const service = await createServiceClient()
    const logId = await logToDb(service, {
      ...params,
      status: "failed",
      failedReason: `suppressed:${preference.reason}`,
    })
    return { success: false, logId, error: `Suppressed: ${preference.reason}` }
  }

  // 2. Fetch org settings for branding + from address
  const orgSettings = await fetchOrgSettings(params.orgId)

  let fromAddress: string
  if (orgSettings?.custom_from_address) {
    fromAddress = `${orgSettings.name} <${orgSettings.custom_from_address}>`
  } else if (orgSettings?.name) {
    fromAddress = `${orgSettings.name} via Pleks <notifications@pleks.co.za>`
  } else {
    fromAddress = DEFAULT_FROM
  }

  const replyTo = params.replyTo ?? orgSettings?.reply_to_email ?? orgSettings?.email ?? REPLY_TO_DEFAULT

  // 3. Render HTML — either from a React Email element or a pre-rendered string
  if (!params.emailElement && !params.rawHtml) throw new Error("sendEmail: provide emailElement or rawHtml")
  const html = params.rawHtml ?? await render(params.emailElement!)

  // 4. Send via Resend
  const service = await createServiceClient()
  let logId = ""

  // Shared audit fields for both success + failure log rows
  const auditFields = {
    bodyFull: html,
    toneVariant: params.toneVariant,
    triggerEventType: params.triggerEventType,
    triggerEventId: params.triggerEventId,
    attemptNumber: params.attemptNumber,
    firstAttemptLogId: params.firstAttemptLogId,
  }

  try {
    const result = await getResend().emails.send({
      from: fromAddress,
      to: [params.to.email],
      subject: params.subject,
      html,
      replyTo: replyTo,
      ...(params.attachments && params.attachments.length > 0 && {
        attachments: params.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: a.contentType,
        })),
      }),
      tags: [
        { name: "org_id", value: params.orgId },
        { name: "template", value: template.key },
        ...(params.entityType ? [{ name: "entity_type", value: params.entityType }] : []),
        ...(params.entityId ? [{ name: "entity_id", value: params.entityId }] : []),
      ],
    })

    logId = await logToDb(service, {
      ...params,
      ...auditFields,
      status: "sent",
      providerId: result.data?.id,
    })

    // Ensure preferences row exists for future opt-out tracking
    await ensurePreferences(params.orgId, {
      contactId: params.to.contactId,
      email: params.to.email,
    })

    return { success: true, logId }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown send error"
    logId = await logToDb(service, {
      ...params,
      ...auditFields,
      status: "failed",
      failedReason: message,
    })
    console.error(`[sendEmail] Failed to send ${params.templateKey} to ${params.to.email}:`, message)
    return { success: false, logId, error: message }
  }
}

/** Helper to build OrgBranding from OrgSettings for use in email templates */
export function buildBranding(orgSettings: OrgSettings | null, unsubscribeToken?: string): OrgBranding {
  return {
    orgName: orgSettings?.name ?? "Pleks",
    orgPhone: orgSettings?.phone,
    orgEmail: orgSettings?.email,
    orgAddress: orgSettings?.address,
    logoUrl: orgSettings?.brand_logo_url,
    accentColor: orgSettings?.brand_accent_color,
    unsubscribeUrl: unsubscribeToken ? `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe/${unsubscribeToken}` : undefined,
    emergencyPhone: orgSettings?.emergency_phone,
    emergencyContactName: orgSettings?.emergency_contact_name,
  }
}
