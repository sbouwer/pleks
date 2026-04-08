/**
 * Communication preference checks.
 * Call canSend() before every outbound message.
 * Mandatory templates (is_mandatory: true) always return true.
 */

import { createServiceClient } from "@/lib/supabase/server"
import { getTemplate } from "./template-registry"

interface CanSendParams {
  orgId: string
  templateKey: string
  email?: string
  contactId?: string
}

interface CanSendResult {
  allowed: boolean
  reason?: string
}

const CATEGORY_TO_COLUMN: Record<string, string> = {
  applications: "email_applications",
  maintenance:  "email_maintenance",
  arrears:      "email_arrears",
  inspections:  "email_inspections",
  leases:       "email_lease",
  statements:   "email_statements",
  deposits:     "email_arrears",  // no separate deposits pref — use arrears (both financial)
}

const SMS_CATEGORY_TO_COLUMN: Record<string, string> = {
  maintenance: "sms_maintenance",
  arrears:     "sms_arrears",
  inspections: "sms_inspections",
}

export async function canSend(params: CanSendParams): Promise<CanSendResult> {
  const template = getTemplate(params.templateKey)

  // Mandatory templates are never suppressed
  if (template.is_mandatory) return { allowed: true }

  const service = await createServiceClient()

  // Look up preferences
  let query = service
    .from("communication_preferences")
    .select("*")
    .eq("org_id", params.orgId)

  if (params.contactId) {
    query = query.eq("contact_id", params.contactId)
  } else if (params.email) {
    query = query.eq("email", params.email)
  } else {
    return { allowed: true }  // no preferences record = default allow
  }

  const { data: prefs } = await query.maybeSingle()

  if (!prefs) return { allowed: true }  // no record = default allow

  // Hard bounce suppresses all future emails
  if (prefs.email_hard_bounced && template.channel !== "sms") {
    return { allowed: false, reason: "email_hard_bounced" }
  }

  // Full unsubscribe
  if (prefs.unsubscribed_at) {
    return { allowed: false, reason: "unsubscribed" }
  }

  // Category-level opt-out
  const isSms = template.channel === "sms"
  const colMap = isSms ? SMS_CATEGORY_TO_COLUMN : CATEGORY_TO_COLUMN
  const col = colMap[template.category]
  if (col && prefs[col as keyof typeof prefs] === false) {
    return { allowed: false, reason: `opted_out_${template.category}` }
  }

  return { allowed: true }
}

/** Ensure a communication_preferences row exists for the given recipient */
export async function ensurePreferences(orgId: string, opts: { contactId?: string; email?: string }) {
  if (!opts.contactId && !opts.email) return
  const service = await createServiceClient()
  const base = { org_id: orgId, ...opts.contactId ? { contact_id: opts.contactId } : { email: opts.email } }
  // upsert — do nothing on conflict (preserve existing prefs)
  await service.from("communication_preferences").upsert(base, { onConflict: opts.contactId ? "org_id,contact_id" : "org_id,email", ignoreDuplicates: true })
}
