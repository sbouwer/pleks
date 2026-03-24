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
  const orgId = params.custom_str3

  if (!applicationId) {
    return NextResponse.json({ error: "Missing application_id" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Update application payment status (table created in BUILD_16)
  // For now, log the event
  await supabase.from("audit_log").insert({
    org_id: orgId || "00000000-0000-0000-0000-000000000000",
    table_name: "applications",
    record_id: applicationId,
    action: "UPDATE",
    new_values: { payment_status: "paid", payfast_payment_id: params.pf_payment_id },
  })

  // TODO: Trigger screening pipeline

  return NextResponse.json({ ok: true })
}
