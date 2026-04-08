/**
 * Single entry point for all outbound emails.
 * Every module calls sendEmail() — never calls Resend directly.
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

import { Resend } from "resend"
import { render } from "@react-email/components"
import { createServiceClient } from "@/lib/supabase/server"
import { getTemplate } from "./template-registry"
import { canSend, ensurePreferences } from "./preferences"
import type { OrgBranding } from "./templates/layout"
import type { ReactElement } from "react"

const resend = new Resend(process.env.RESEND_API_KEY)

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
  /** The rendered React Email element (from the template component) */
  emailElement: ReactElement
  /** Plain-text body preview (first ~200 chars shown in log) */
  bodyPreview?: string
  entityType?: string
  entityId?: string
  triggeredBy?: string       // user ID — omit for cron/system
  replyTo?: string           // defaults to org's configured email
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
}

async function fetchOrgSettings(orgId: string): Promise<OrgSettings | null> {
  const service = await createServiceClient()
  const { data } = await service
    .from("organisations")
    .select("name, email, phone, address_line1, city, brand_logo_url, brand_accent_color, custom_from_address, reply_to_email")
    .eq("id", orgId)
    .single()
  if (!data) return null
  return {
    name: data.name as string,
    email: data.email as string | undefined,
    phone: data.phone as string | undefined,
    address: [data.address_line1, data.city].filter(Boolean).join(", ") || undefined,
    brand_logo_url: data.brand_logo_url as string | undefined,
    brand_accent_color: data.brand_accent_color as string | undefined,
    custom_from_address: data.custom_from_address as string | undefined,
    reply_to_email: data.reply_to_email as string | undefined,
  }
}

async function logToDb(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  params: {
    orgId: string
    templateKey: string
    to: SendEmailParams["to"]
    subject: string
    bodyPreview?: string
    entityType?: string
    entityId?: string
    triggeredBy?: string
    status: "sent" | "failed"
    providerId?: string
    failedReason?: string
  }
): Promise<string> {
  const { data: log } = await service
    .from("communication_log")
    .insert({
      org_id: params.orgId,
      channel: "email",
      recipient_contact_id: params.to.contactId ?? null,
      recipient_email: params.to.email,
      recipient_name: params.to.name,
      template_key: params.templateKey,
      subject: params.subject,
      body_preview: params.bodyPreview?.slice(0, 200) ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      status: params.status,
      provider_id: params.providerId ?? null,
      failed_reason: params.failedReason ?? null,
      triggered_by: params.triggeredBy ?? null,
    })
    .select("id")
    .single()
  return log?.id ?? ""
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

  const fromAddress = orgSettings?.custom_from_address
    ? `${orgSettings.name} <${orgSettings.custom_from_address}>`
    : orgSettings?.name
      ? `${orgSettings.name} via Pleks <notifications@pleks.co.za>`
      : DEFAULT_FROM

  const replyTo = params.replyTo ?? orgSettings?.reply_to_email ?? orgSettings?.email ?? REPLY_TO_DEFAULT

  // 3. Render HTML from the React Email element (already includes layout)
  const html = await render(params.emailElement)

  // 4. Send via Resend
  const service = await createServiceClient()
  let logId = ""

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: [params.to.email],
      subject: params.subject,
      html,
      replyTo: replyTo,
      tags: [
        { name: "org_id", value: params.orgId },
        { name: "template", value: template.key },
        ...(params.entityType ? [{ name: "entity_type", value: params.entityType }] : []),
        ...(params.entityId ? [{ name: "entity_id", value: params.entityId }] : []),
      ],
    })

    logId = await logToDb(service, {
      ...params,
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
  }
}
