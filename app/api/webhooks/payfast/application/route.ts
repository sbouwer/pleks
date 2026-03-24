import { NextResponse } from "next/server"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  if (params.payment_status !== "COMPLETE") {
    return NextResponse.json({ ok: true })
  }

  const { valid, error } = await validatePayFastITN(params, rawBody)
  if (!valid) {
    console.error("PayFast application ITN validation failed:", error)
    return NextResponse.json({ error }, { status: 400 })
  }

  const applicationId = params.custom_str1
  if (!applicationId) {
    return NextResponse.json({ error: "Missing application_id" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Update application: fee paid, trigger screening
  await supabase.from("applications").update({
    fee_status: "paid",
    fee_paid_at: new Date().toISOString(),
    payfast_payment_id: params.pf_payment_id || params.m_payment_id,
    stage2_status: "payment_received",
  }).eq("id", applicationId)

  // Mark screening in progress
  await supabase.from("applications").update({
    stage2_status: "screening_in_progress",
    searchworx_check_status: "pending",
  }).eq("id", applicationId)

  // Audit log
  const { data: app } = await supabase
    .from("applications")
    .select("org_id")
    .eq("id", applicationId)
    .single()

  if (app) {
    await supabase.from("audit_log").insert({
      org_id: app.org_id,
      table_name: "applications",
      record_id: applicationId,
      action: "UPDATE",
      new_values: {
        fee_status: "paid",
        stage2_status: "screening_in_progress",
      },
    })
  }

  return NextResponse.json({ ok: true })
}
