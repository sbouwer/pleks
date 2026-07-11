/**
 * app/api/cron/arrears-sequence/route.ts — daily arrears sequence progression
 *
 * Route:  GET /api/cron/arrears-sequence
 * Auth:   x-cron-secret header — called by daily orchestrator, not directly by Vercel
 * Data:   rent_invoices, arrears_cases, arrears_sequence_steps, tenant_view (service client)
 * Notes:  BUILD_63 Phase 2 rewrite — routes every step through lib/messaging/router.ts.
 *         Step → template_key resolved by action_type; tone resolved from step.tone + org prefs.
 *         A3/A4 (LOD + final notice) are mandatory — queued for retry if send fails.
 *         SMS body generated per tone for A1/A2; React Email component used for A2 email
 *         fallback and A3/A4.
 */
import * as React from "react"
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { differenceInDays } from "date-fns"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/org/capabilities"
import type { OrgType } from "@/lib/constants"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { ArrearsReminderEmail } from "@/lib/comms/templates/tenant/arrears/reminder"
import { LetterOfDemandEmail } from "@/lib/comms/templates/tenant/arrears/letter-of-demand"
import { FinalNoticeEmail } from "@/lib/comms/templates/tenant/arrears/final-notice"
import { withCronRun } from "@/lib/cron/withCronRun"
import { fmtDateLongZA, saDateISO } from "@/lib/dates"
import { optionalEnv } from "@/lib/env"

// ── Types ───────────────────────────────────────────────────────────────────

type ToneVariant = "friendly" | "professional" | "firm"

type OverdueInvoice = {
  id: string
  org_id: string
  lease_id: string
  tenant_id: string
  unit_id: string
  due_date: string
  balance_cents: number | null
  leases: unknown
}

type ArrearsCase = {
  id: string
  org_id: string
  tenant_id: string
  lease_id: string | null
  unit_id: string | null
  current_step: number
  sequence_id: string
  oldest_outstanding_date: string | null
  total_arrears_cents: number
  months_in_arrears: number
}

type TenantInfo = {
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeSAPhone(phone: string): string {
  const digits = phone.replaceAll(/\D/g, "")
  if (digits.startsWith("27") && digits.length === 11) return `+${digits}`
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`
  return phone
}

function formatAmount(cents: number): string {
  return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
}

function formatDate(isoDate: string): string {
  return fmtDateLongZA(isoDate)
}

function tenantDisplayName(info: TenantInfo): string {
  return [info.first_name, info.last_name].filter(Boolean).join(" ").trim() || "Tenant"
}

/**
 * Maps step action_type to the BUILD_63 template key.
 * Returns null for steps that don't fire comms (agent_task, etc.).
 */
function resolveTemplateKey(actionType: string, stepNumber: number): string | null {
  if (actionType === "letter_of_demand") return "arrears.letter_of_demand"
  if (actionType === "pre_legal_notice") return "arrears.final_notice"
  if (actionType === "agent_task")       return null
  // sms / email / whatsapp → relational by step
  return stepNumber <= 1 ? "arrears.reminder_step1" : "arrears.reminder_step2"
}

/**
 * Maps step tone string (DB) + org preference → ToneVariant for router.
 * DB tone "formal" / "legal" → "firm" (for steps that aren't legal template keys).
 */
function resolveToneVariant(stepTone: string, orgTone: string): ToneVariant {
  if (stepTone === "friendly") return "friendly"
  if (stepTone === "firm" || stepTone === "formal" || stepTone === "legal") return "firm"
  const o = orgTone as ToneVariant
  return (o === "friendly" || o === "professional" || o === "firm") ? o : "professional"
}

/** WhatsApp template params for A1/A2 relational steps. */
function buildWhatsAppTemplate(
  templateKey: string,
  tenantFirstName: string,
  amountDisplay: string,
  daysOverdue: number,
  sender: string,
): { name: string; parameters: string[] } | undefined {
  const name = tenantFirstName || "Tenant"
  if (templateKey === "arrears.reminder_step1") {
    return { name: "arrears_step1_friendly_v1", parameters: [name, amountDisplay, String(daysOverdue), sender] }
  }
  if (templateKey === "arrears.reminder_step2") {
    return { name: "arrears_step2_firm_v1", parameters: [name, amountDisplay, sender] }
  }
  return undefined
}

/**
 * SMS body per template (≤160 chars GSM-7). A1/A2 vary by tone; the LOD (A3) + final notice (A4) are formal
 * and tone-independent. Giving the legal steps their OWN SMS body (O-16 R4) means their WhatsApp body — which
 * carries an exact "5 business days" statutory countdown — is never derived-and-truncated into an SMS that
 * could sever the claim mid-word. The SMS states the seriousness truthfully; the precise deadline lives in the
 * formal email/letter, not a 160-char SMS. Avoids non-GSM-7 chars (em-dash, curly quotes) to stay single-segment.
 */
function buildSmsBody(
  templateKey: string,
  tenantFirstName: string,
  amountDisplay: string,
  tone: ToneVariant,
  sender: string,
): string {
  const name = tenantFirstName || "Tenant"
  if (templateKey === "arrears.letter_of_demand") {
    return `LETTER OF DEMAND: ${amountDisplay} rent arrears unpaid. Please settle or contact us urgently; formal recovery follows if unresolved. - ${sender}`
  }
  if (templateKey === "arrears.final_notice") {
    return `FINAL NOTICE: ${amountDisplay} rent arrears unpaid. Final notice before formal legal steps. Please contact us immediately. - ${sender}`
  }
  if (templateKey === "arrears.reminder_step1") {
    if (tone === "friendly")      return `Hi ${name}, just a reminder - your rent (${amountDisplay}) is overdue. Please pay or contact us soon. - ${sender}`
    if (tone === "firm")          return `${name}: Rent of ${amountDisplay} is overdue. Pay immediately or contact us to avoid escalation. - ${sender}`
    return `Hi ${name}, your rent account has an overdue balance of ${amountDisplay}. Please arrange payment urgently. - ${sender}`
  }
  // arrears.reminder_step2
  if (tone === "friendly")        return `Hi ${name}, your rent (${amountDisplay}) is still outstanding. Please pay urgently before formal action is taken. - ${sender}`
  if (tone === "firm")            return `${name}: ${amountDisplay} in rent arrears remains unpaid. Formal proceedings will follow without immediate payment. - ${sender}`
  return `REMINDER ${name}: Rent arrears of ${amountDisplay} unpaid. Act immediately to avoid a letter of demand. - ${sender}`
}

async function fetchPropertyLabel(supabase: SupabaseClient, unitId: string): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("units")
    .select("unit_number, properties(address_line1, suburb, city)")
    .eq("id", unitId)
    .maybeSingle()
  if (error) console.error("fetchPropertyLabel units read failed:", error.message)
  if (!data) return undefined
  // Supabase infers the embedded relation as array; unit→property is many-to-one so cast through unknown
  type PropRow = { address_line1: string; suburb: string | null; city: string }
  const raw = data as unknown as { unit_number: string; properties: PropRow | PropRow[] | null }
  const prop = Array.isArray(raw.properties) ? raw.properties[0] : raw.properties
  if (!prop) return undefined
  const parts = [prop.address_line1, `Unit ${raw.unit_number}`, prop.suburb ?? prop.city].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : undefined
}

async function fetchLeaseFacts(
  supabase: SupabaseClient, leaseId: string,
): Promise<{ startDate?: string; cpaApplies?: boolean }> {
  const { data, error } = await supabase
    .from("leases")
    .select("start_date, cpa_applies_at_signing")
    .eq("id", leaseId)
    .maybeSingle()
  if (error) console.error("fetchLeaseFacts leases read failed:", error.message)
  return {
    startDate: data?.start_date ? formatDate(data.start_date as string) : undefined,
    // The final notice's cancellation-cure citation branches on this (F-1 #1). cpa_applies_at_signing is
    // 3-state TEXT ('yes'|'no'|'indeterminate'), NOT a boolean — the old `as boolean` cast let 'no' and
    // 'indeterminate' (truthy strings) render the CPA s14 citation on leases the CPA does not govern. Only
    // an explicit 'yes' takes the CPA branch; everything else falls to the safe contractual/common-law basis.
    cpaApplies: data?.cpa_applies_at_signing === "yes",
  }
}

function resolveSubject(templateKey: string, amountDisplay: string, ref: string): string {
  if (templateKey === "arrears.letter_of_demand") return `LETTER OF DEMAND — ${amountDisplay} — Ref ${ref}`
  if (templateKey === "arrears.final_notice")     return `FINAL NOTICE — Lease cancellation pending — ${amountDisplay}`
  // Ref threads the reminder emails (step1/step2) with the LOD/final-notice that follow — same case-id prefix (O-16 R8)
  return `Rent reminder: ${amountDisplay} overdue — Ref ${ref}`
}

interface EmailElementParams {
  branding:        ReturnType<typeof buildBranding>
  tenantName:      string
  amountDisplay:   string
  daysOverdue:     number
  nextStep:        number
  toneVariant:     ToneVariant | "n/a"
  oldestDate:      string
  sender:          string
  caseId:          string
  monthsInArrears: number
  propertyLabel?:  string   // full address from unit+property join; falls back to "See reference XXXX"
  leaseStartDate?: string   // actual lease start date; falls back to oldestDate if unavailable
  cpaApplies?:     boolean   // lease cpa_applies_at_signing snapshot — selects the final-notice cure citation (F-1 #1)
}

function buildEmailElement(
  templateKey: string,
  p: EmailElementParams,
): React.ReactElement | undefined {
  const ref           = p.caseId.slice(0, 8).toUpperCase()
  const propertyLabel = p.propertyLabel ?? `See reference ${ref}`
  const leaseStart    = p.leaseStartDate ?? p.oldestDate

  if (templateKey === "arrears.reminder_step2") {
    return React.createElement(ArrearsReminderEmail, {
      branding:          p.branding,
      tenantName:        p.tenantName,
      propertyLabel,
      amountOwedDisplay: p.amountDisplay,
      daysOverdue:       p.daysOverdue,
      step:              p.nextStep <= 1 ? 1 : 2,
      tone:              p.toneVariant === "n/a" ? "professional" : p.toneVariant,
      senderName:        p.sender,
      referenceNumber:   ref,
    })
  }
  if (templateKey === "arrears.letter_of_demand") {
    return React.createElement(LetterOfDemandEmail, {
      branding:              p.branding,
      tenantName:            p.tenantName,
      propertyLabel,
      leaseStartDate:        leaseStart,
      amountOwedDisplay:     p.amountDisplay,
      monthsInArrears:       p.monthsInArrears,
      oldestOutstandingDate: p.oldestDate,
      paymentDeadlineDays:   7,
      referenceNumber:       ref,
    })
  }
  if (templateKey === "arrears.final_notice") {
    return React.createElement(FinalNoticeEmail, {
      branding:               p.branding,
      tenantName:             p.tenantName,
      propertyLabel,
      leaseStartDate:         leaseStart,
      amountOwedDisplay:      p.amountDisplay,
      monthsInArrears:        p.monthsInArrears,
      oldestOutstandingDate:  p.oldestDate,
      cancellationNoticeDays: 20,
      referenceNumber:        ref,
      cpaApplies:             p.cpaApplies,
    })
  }
  return undefined
}

// ── Core case handlers ───────────────────────────────────────────────────────

async function handleOverdueInvoice(
  supabase: SupabaseClient,
  inv: OverdueInvoice,
  today: Date,
): Promise<boolean> {
  await supabase.from("rent_invoices").update({ status: "overdue" }).eq("id", inv.id).eq("status", "open")

  const { data: existing, error: existingError } = await supabase
    .from("arrears_cases")
    .select("id")
    .eq("lease_id", inv.lease_id)
    .in("status", ["open", "payment_arrangement"])
    .limit(1)
  if (existingError) console.error("handleOverdueInvoice arrears_cases lookup failed:", existingError.message)

  if (existing && existing.length > 0) {
    const daysOverdue = differenceInDays(today, new Date(inv.due_date))
    const months = Math.ceil(daysOverdue / 30)
    const { data: allOverdue, error: allOverdueError } = await supabase
      .from("rent_invoices")
      .select("balance_cents")
      .eq("lease_id", inv.lease_id)
      .eq("status", "overdue")
    if (allOverdueError) console.error("handleOverdueInvoice rent_invoices read failed:", allOverdueError.message)
    const totalArrears = (allOverdue ?? []).reduce((s, i) => s + (i.balance_cents ?? 0), 0)
    await supabase.from("arrears_cases").update({
      total_arrears_cents: totalArrears,
      months_in_arrears: months,
    }).eq("id", existing[0].id)
    return false
  }

  const lease = inv.leases as { property_id: string; lease_type: string } | null
  const { data: sequence, error: sequenceError } = await supabase
    .from("arrears_sequences")
    .select("id")
    .eq("org_id", inv.org_id)
    .eq("lease_type", lease?.lease_type ?? "residential")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle()
  if (sequenceError) console.error("handleOverdueInvoice arrears_sequences read failed:", sequenceError.message)

  await supabase.from("arrears_cases").insert({
    org_id:                  inv.org_id,
    lease_id:                inv.lease_id,
    tenant_id:               inv.tenant_id,
    unit_id:                 inv.unit_id,
    property_id:             lease?.property_id ?? "",
    lease_type:              lease?.lease_type ?? "residential",
    total_arrears_cents:     inv.balance_cents ?? 0,
    oldest_outstanding_date: inv.due_date,
    months_in_arrears:       1,
    sequence_id:             sequence?.id ?? null,
    status:                  "open",
  })
  return true
}

async function advanceSequenceStep(
  supabase: SupabaseClient,
  arrearsCase: ArrearsCase,
  today: Date,
  capabilities: OrgCapabilities,
  orgTone: string,
): Promise<boolean> {
  if (!arrearsCase.oldest_outstanding_date) return false

  const daysOverdue = differenceInDays(today, new Date(arrearsCase.oldest_outstanding_date))
  const nextStep = arrearsCase.current_step + 1

  const { data: step, error: stepErr } = await supabase
    .from("arrears_sequence_steps")
    .select("*")
    .eq("sequence_id", arrearsCase.sequence_id)
    .eq("step_number", nextStep)
    .single()

  if (stepErr || !step || daysOverdue < step.trigger_days) return false

  // Idempotency — don't fire twice for the same step
  const { data: existingAction, error: existingActionError } = await supabase
    .from("arrears_actions")
    .select("id")
    .eq("case_id", arrearsCase.id)
    .eq("step_number", nextStep)
    .limit(1)
  if (existingActionError) console.error("advanceSequenceStep arrears_actions lookup failed:", existingActionError.message)
  if (existingAction && existingAction.length > 0) return false

  const templateKey = resolveTemplateKey(step.action_type, nextStep)
  if (!templateKey) {
    // agent_task or unrecognised — advance step but don't send comm
    await supabase.from("arrears_cases").update({ current_step: nextStep }).eq("id", arrearsCase.id)
    return true
  }

  // Fetch tenant info
  const { data: tenantRaw, error: tenantRawError } = await supabase
    .from("tenant_view")
    .select("first_name, last_name, email, phone")
    .eq("id", arrearsCase.tenant_id)
    .maybeSingle()
  if (tenantRawError) console.error("advanceSequenceStep tenant_view read failed:", tenantRawError.message)
  const tenant = tenantRaw as TenantInfo | null

  const tenantName    = tenantDisplayName(tenant ?? { first_name: null, last_name: null, email: null, phone: null })
  const amountDisplay = formatAmount(arrearsCase.total_arrears_cents)
  const sender        = capabilities.copy.tenantWelcomeSender

  // Resolve tone variant — org tone_tenant used as fallback for relational steps
  const toneVariant = templateKey === "arrears.letter_of_demand" || templateKey === "arrears.final_notice"
    ? ("n/a" as const)
    : resolveToneVariant(step.tone ?? "professional", orgTone)

  const firstName = tenant?.first_name ?? "Tenant"

  // Build SMS body. Toned reminders (A1/A2) pass their tone; the formal legal steps (LOD/final notice) are
  // tone-independent but STILL get a dedicated SMS body (O-16 R4) so they never fall through to the
  // WhatsApp-derived-and-truncated fallback. Only the relational steps carry a WhatsApp template.
  const smsTone: ToneVariant = toneVariant === "n/a" ? "firm" : toneVariant
  const smsBody = tenant?.phone
    ? buildSmsBody(templateKey, firstName, amountDisplay, smsTone, sender)
    : undefined

  // Build WhatsApp template params (for relational steps A1/A2)
  const whatsappTemplate = (toneVariant !== "n/a" && tenant?.phone)
    ? buildWhatsAppTemplate(templateKey, firstName, amountDisplay, daysOverdue, sender)
    : undefined

  // Build email element
  const orgSettings = await fetchOrgSettings(arrearsCase.org_id)
  const branding    = buildBranding(orgSettings)
  const oldestDate  = arrearsCase.oldest_outstanding_date
    ? formatDate(arrearsCase.oldest_outstanding_date)
    : "unknown date"

  const propertyLabel = arrearsCase.unit_id
    ? await fetchPropertyLabel(supabase, arrearsCase.unit_id)
    : undefined
  const leaseFacts = arrearsCase.lease_id
    ? await fetchLeaseFacts(supabase, arrearsCase.lease_id)
    : {}

  const emailElement = buildEmailElement(templateKey, {
    branding, tenantName, amountDisplay, daysOverdue, nextStep, toneVariant, oldestDate, sender,
    caseId: arrearsCase.id, monthsInArrears: arrearsCase.months_in_arrears,
    propertyLabel, leaseStartDate: leaseFacts.startDate, cpaApplies: leaseFacts.cpaApplies,
  })

  const ref     = arrearsCase.id.slice(0, 8).toUpperCase()
  const subject = resolveSubject(templateKey, amountDisplay, ref)

  // Record the action before sending (idempotency anchor)
  await supabase.from("arrears_actions").insert({
    org_id:      arrearsCase.org_id,
    case_id:     arrearsCase.id,
    step_number: nextStep,
    action_type: step.action_type,
    channel:     emailElement ? "email" : "sms",
    subject,
    ai_drafted:  step.ai_draft,
  })

  // Route and send
  if (tenant?.email || tenant?.phone) {
    await routeAndSend({
      orgId:             arrearsCase.org_id,
      templateKey,
      tenantId:          arrearsCase.tenant_id,
      to: {
        email:     tenant.email ?? undefined,
        phone:     tenant.phone ? normalizeSAPhone(tenant.phone) : undefined,
        name:      tenantName,
      },
      subject,
      emailElement,
      smsBody,
      whatsappTemplate,
      bodyPreview: `${amountDisplay} overdue — step ${nextStep}`,
      entityType:  "arrears_case",
      entityId:    arrearsCase.id,
      toneVariant,
      triggerEventType: "arrears_action",
      triggerEventId:   arrearsCase.id,
    })
  }

  await supabase.from("arrears_cases").update({ current_step: nextStep }).eq("id", arrearsCase.id)
  return true
}

async function autoResolveIfPaid(
  supabase: SupabaseClient,
  arrearsCase: { id: string; lease_id: string; org_id: string; tenant_id: string },
): Promise<boolean> {
  const { data: stillOverdue, error: stillOverdueError } = await supabase
    .from("rent_invoices")
    .select("id")
    .eq("lease_id", arrearsCase.lease_id)
    .eq("status", "overdue")
    .limit(1)

  if (stillOverdueError) console.error("autoResolveIfPaid rent_invoices read failed:", stillOverdueError.message)
  if (stillOverdue && stillOverdue.length > 0) return false

  await supabase.from("arrears_cases").update({
    status:           "resolved",
    resolved_at:      new Date().toISOString(),
    resolution_notes: "All overdue invoices paid",
    total_arrears_cents: 0,
  }).eq("id", arrearsCase.id)

  // Fire arrears.resolved comm (non-mandatory, transactional, email only)
  const { data: tenantRaw, error: tenantRawError } = await supabase
    .from("tenant_view")
    .select("first_name, last_name, email, phone")
    .eq("id", arrearsCase.tenant_id)
    .maybeSingle()
  if (tenantRawError) console.error("autoResolveIfPaid tenant_view read failed:", tenantRawError.message)
  const tenant = tenantRaw as TenantInfo | null
  if (tenant?.email) {
    await routeAndSend({
      orgId:       arrearsCase.org_id,
      templateKey: "arrears.resolved",
      tenantId:    arrearsCase.tenant_id,
      to: {
        email: tenant.email,
        name:  tenantDisplayName(tenant),
      },
      subject:         "Your rental account is now up to date",
      bodyPreview:     "All arrears have been cleared — your account is in good standing.",
      entityType:      "arrears_case",
      entityId:        arrearsCase.id,
      triggerEventType:"arrears_action",
      triggerEventId:  arrearsCase.id,
    }).catch(() => undefined)  // fire-and-forget; not mandatory
  }

  return true
}

// ── Phase runners ────────────────────────────────────────────────────────────

async function phase1DetectNewArrears(supabase: SupabaseClient, today: Date): Promise<number> {
  const todayStr = saDateISO(today)
  const { data: overdueInvoices, error: invErr } = await supabase
    .from("rent_invoices")
    .select("id, org_id, lease_id, tenant_id, unit_id, due_date, balance_cents, leases(property_id, lease_type)")
    .in("status", ["open", "partial", "overdue"])
    .lt("due_date", todayStr)
  if (invErr) console.error("[arrears-sequence] overdue invoices:", invErr.message)

  let count = 0
  for (const inv of overdueInvoices ?? []) {
    try {
      const created = await handleOverdueInvoice(supabase, inv as OverdueInvoice, today)
      if (created) count++
    } catch (e) {
      console.error("[arrears-sequence] handleOverdueInvoice failed for", inv.id, e instanceof Error ? e.message : e)
    }
  }
  return count
}

async function phase2AdvanceSequences(supabase: SupabaseClient, today: Date): Promise<number> {
  const { data: openCases, error: casesErr } = await supabase
    .from("arrears_cases")
    .select("id, org_id, tenant_id, lease_id, unit_id, current_step, sequence_id, oldest_outstanding_date, total_arrears_cents, months_in_arrears")
    .eq("status", "open")
    .eq("sequence_paused", false)
    .not("sequence_id", "is", null)
  if (casesErr) console.error("[arrears-sequence] open cases:", casesErr.message)

  const uniqueOrgIds = [...new Set((openCases ?? []).map((c) => c.org_id))]
  const capabilitiesMap = new Map<string, OrgCapabilities>()
  const orgToneMap      = new Map<string, string>()
  if (uniqueOrgIds.length > 0) {
    const { data: orgs, error: orgsError } = await supabase.from("organisations").select("id, type, name, settings").in("id", uniqueOrgIds)
    if (orgsError) console.error("phase2AdvanceSequences organisations read failed:", orgsError.message)
    for (const org of orgs ?? []) {
      capabilitiesMap.set(org.id, getOrgCapabilities((org.type as OrgType) ?? "agency", (org.name as string) ?? ""))
      const settings = org.settings as { communication?: { tone_tenant?: string } } | null
      orgToneMap.set(org.id, settings?.communication?.tone_tenant ?? "professional")
    }
  }

  let count = 0
  for (const arrearsCase of openCases ?? []) {
    try {
      const capabilities = capabilitiesMap.get(arrearsCase.org_id) ?? getOrgCapabilities("agency", "")
      const orgTone      = orgToneMap.get(arrearsCase.org_id) ?? "professional"
      const advanced = await advanceSequenceStep(supabase, arrearsCase as ArrearsCase, today, capabilities, orgTone)
      if (advanced) count++
    } catch (e) {
      console.error("[arrears-sequence] advanceSequenceStep failed for case", arrearsCase.id, e instanceof Error ? e.message : e)
    }
  }
  return count
}

async function phase3AutoResolve(supabase: SupabaseClient): Promise<number> {
  const { data: paidCases, error: paidErr } = await supabase
    .from("arrears_cases")
    .select("id, lease_id, org_id, tenant_id")
    .in("status", ["open", "payment_arrangement"])
  if (paidErr) console.error("[arrears-sequence] paid cases:", paidErr.message)

  let count = 0
  for (const arrearsCase of paidCases ?? []) {
    try {
      const resolved = await autoResolveIfPaid(supabase, arrearsCase)
      if (resolved) count++
    } catch (e) {
      console.error("[arrears-sequence] autoResolveIfPaid failed for case", arrearsCase.id, e instanceof Error ? e.message : e)
    }
  }
  return count
}

// ── Route handler ────────────────────────────────────────────────────────────

export const GET = withCronRun("arrears_sequence", handler)

async function handler(_req: Request): Promise<Response> {

  const supabase = await createServiceClient()
  const today    = new Date()
  let processed  = 0

  try {
    processed += await phase1DetectNewArrears(supabase, today)
    processed += await phase2AdvanceSequences(supabase, today)
    processed += await phase3AutoResolve(supabase)
  } catch (e) {
    console.error("[arrears-sequence] fatal error:", e instanceof Error ? e.message : e)
  } finally {
    // Await the ping — void/fire-and-forget is killed when the serverless function returns
    if (optionalEnv("HEARTBEAT_ARREARS_SEQUENCE")) {
      await fetch(optionalEnv("HEARTBEAT_ARREARS_SEQUENCE"), { method: "POST" }).catch(() => undefined)
    } else {
      console.warn("[arrears-sequence] HEARTBEAT_ARREARS_SEQUENCE env var missing — heartbeat skipped")
    }
  }

  return NextResponse.json({ ok: true, processed })
}
