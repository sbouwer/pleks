import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/sms/sendSMS"
import { differenceInDays } from "date-fns"
import type { SupabaseClient } from "@supabase/supabase-js"

function normalizeSAPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("27") && digits.length === 11) return `+${digits}`
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`
  return phone
}

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
  current_step: number
  sequence_id: string
  oldest_outstanding_date: string | null
  total_arrears_cents: number
}

async function handleOverdueInvoice(supabase: SupabaseClient, inv: OverdueInvoice, today: Date): Promise<boolean> {
  await supabase.from("rent_invoices").update({ status: "overdue" }).eq("id", inv.id).eq("status", "open")

  const { data: existing } = await supabase
    .from("arrears_cases")
    .select("id")
    .eq("lease_id", inv.lease_id)
    .in("status", ["open", "payment_arrangement"])
    .limit(1)

  if (existing && existing.length > 0) {
    const daysOverdue = differenceInDays(today, new Date(inv.due_date))
    const months = Math.ceil(daysOverdue / 30)

    const { data: allOverdue } = await supabase
      .from("rent_invoices")
      .select("balance_cents")
      .eq("lease_id", inv.lease_id)
      .eq("status", "overdue")

    const totalArrears = (allOverdue || []).reduce((sum, i) => sum + (i.balance_cents || 0), 0)

    await supabase.from("arrears_cases").update({
      total_arrears_cents: totalArrears,
      months_in_arrears: months,
    }).eq("id", existing[0].id)

    return false
  }

  const lease = inv.leases as { property_id: string; lease_type: string } | null

  const { data: sequence } = await supabase
    .from("arrears_sequences")
    .select("id")
    .eq("org_id", inv.org_id)
    .eq("lease_type", lease?.lease_type || "residential")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle()

  await supabase.from("arrears_cases").insert({
    org_id: inv.org_id,
    lease_id: inv.lease_id,
    tenant_id: inv.tenant_id,
    unit_id: inv.unit_id,
    property_id: lease?.property_id || "",
    lease_type: lease?.lease_type || "residential",
    total_arrears_cents: inv.balance_cents || 0,
    oldest_outstanding_date: inv.due_date,
    months_in_arrears: 1,
    sequence_id: sequence?.id || null,
    status: "open",
  })

  return true
}

async function advanceSequenceStep(supabase: SupabaseClient, arrearsCase: ArrearsCase, today: Date): Promise<boolean> {
  if (!arrearsCase.oldest_outstanding_date) return false

  const daysOverdue = differenceInDays(today, new Date(arrearsCase.oldest_outstanding_date))
  const nextStep = arrearsCase.current_step + 1

  const { data: step } = await supabase
    .from("arrears_sequence_steps")
    .select("*")
    .eq("sequence_id", arrearsCase.sequence_id)
    .eq("step_number", nextStep)
    .single()

  if (!step || daysOverdue < step.trigger_days) return false

  const { data: existingAction } = await supabase
    .from("arrears_actions")
    .select("id")
    .eq("case_id", arrearsCase.id)
    .eq("step_number", nextStep)
    .limit(1)

  if (existingAction && existingAction.length > 0) return false

  await supabase.from("arrears_actions").insert({
    org_id: arrearsCase.org_id,
    case_id: arrearsCase.id,
    step_number: nextStep,
    action_type: step.action_type,
    channel: step.action_type === "sms" || step.action_type === "whatsapp" ? step.action_type : "email",
    subject: "Arrears step " + nextStep + ": " + step.action_type + " (" + step.tone + ")",
    ai_drafted: step.ai_draft,
  })

  if (step.action_type === "sms") {
    const { data: tenant } = await supabase
      .from("tenant_view")
      .select("first_name, phone")
      .eq("id", arrearsCase.tenant_id)
      .maybeSingle()

    if (tenant?.phone) {
      const amountRands = (arrearsCase.total_arrears_cents / 100).toFixed(2)
      const message = "Hi " + (tenant.first_name || "Tenant") + ", your rental account is R" + amountRands + " in arrears. Please make payment urgently or contact your agent to avoid further action. - Pleks"
      await sendSMS(normalizeSAPhone(tenant.phone), message, arrearsCase.org_id).catch(() => null)
    }
  }

  await supabase.from("arrears_cases").update({ current_step: nextStep }).eq("id", arrearsCase.id)

  return true
}

async function autoResolveIfPaid(supabase: SupabaseClient, arrearsCase: { id: string; lease_id: string }): Promise<boolean> {
  const { data: stillOverdue } = await supabase
    .from("rent_invoices")
    .select("id")
    .eq("lease_id", arrearsCase.lease_id)
    .eq("status", "overdue")
    .limit(1)

  if (stillOverdue && stillOverdue.length > 0) return false

  await supabase.from("arrears_cases").update({
    status: "resolved",
    resolved_at: new Date().toISOString(),
    resolution_notes: "All overdue invoices paid",
    total_arrears_cents: 0,
  }).eq("id", arrearsCase.id)

  return true
}

export async function GET(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret")
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]
  let processed = 0

  // 1. Detect new arrears — overdue invoices without an arrears case
  const { data: overdueInvoices } = await supabase
    .from("rent_invoices")
    .select("id, org_id, lease_id, tenant_id, unit_id, due_date, balance_cents, leases(property_id, lease_type)")
    .in("status", ["open", "partial", "overdue"])
    .lt("due_date", todayStr)

  for (const inv of overdueInvoices || []) {
    const created = await handleOverdueInvoice(supabase, inv as OverdueInvoice, today)
    if (created) processed++
  }

  // 2. Advance sequences for open cases (not paused)
  const { data: openCases } = await supabase
    .from("arrears_cases")
    .select("id, org_id, tenant_id, current_step, sequence_id, oldest_outstanding_date, total_arrears_cents")
    .eq("status", "open")
    .eq("sequence_paused", false)
    .not("sequence_id", "is", null)

  for (const arrearsCase of openCases || []) {
    const advanced = await advanceSequenceStep(supabase, arrearsCase as ArrearsCase, today)
    if (advanced) processed++
  }

  // 3. Auto-resolve cases where all invoices are now paid
  const { data: paidCases } = await supabase
    .from("arrears_cases")
    .select("id, lease_id, org_id")
    .in("status", ["open", "payment_arrangement"])

  for (const arrearsCase of paidCases || []) {
    const resolved = await autoResolveIfPaid(supabase, arrearsCase)
    if (resolved) processed++
  }

  return NextResponse.json({ ok: true, processed })
}
