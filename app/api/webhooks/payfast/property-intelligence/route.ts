/**
 * app/api/webhooks/payfast/property-intelligence/route.ts — PayFast ITN for PAYG intelligence pulls
 *
 * Route:  POST /api/webhooks/payfast/property-intelligence
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   property_intelligence_pulls (status → running, payfast_payment_id),
 *         organisation_payment_tokens (upsert on first tokenised checkout),
 *         payments (insert), audit_log
 * Notes:  ADDENDUM_14A. custom_str1=pullId, custom_str2=orgId, custom_str3=productType.
 *         If PayFast returns a `token` field, this is a tokenised checkout (subscription_type=2);
 *         store the token in organisation_payment_tokens for future 1-click adhoc charges (D-14A-19).
 *         After confirming payment, triggers vendor execution at /api/property-intelligence/run/[pullId].
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const params  = Object.fromEntries(new URLSearchParams(rawBody))

  if (params.payment_status !== "COMPLETE") {
    return NextResponse.json({ ok: true })
  }

  const { valid, error } = await validatePayFastITN(params, rawBody)
  if (!valid) {
    console.error("[payfast/property-intelligence] ITN validation failed:", error)
    return NextResponse.json({ error }, { status: 400 })
  }

  const pullId      = params.custom_str1
  const orgId       = params.custom_str2
  const productType = params.custom_str3
  const pfToken     = params.token ?? null        // present when subscription_type=2
  const last4       = params.card_last_four ?? null
  const cardBrand   = params.card_brand ?? null
  const transactionId = params.pf_payment_id || params.m_payment_id || null

  if (!pullId || !orgId || !productType) {
    return NextResponse.json({ error: "Missing custom fields" }, { status: 400 })
  }

  try {
    const service = await createServiceClient()
    const now     = new Date().toISOString()

    // Idempotency — if pull is already past 'pending', PayFast is retrying a delivered ITN
    const { data: pull } = await service
      .from("property_intelligence_pulls")
      .select("id, status, retail_cents")
      .eq("id", pullId)
      .single()

    if (!pull) {
      return NextResponse.json({ error: "Pull not found" }, { status: 404 })
    }
    if (pull.status !== "pending") {
      return NextResponse.json({ ok: true })
    }

    // Record payment
    const { data: payment } = await service
      .from("payments")
      .insert({
        org_id:                orgId,
        amount_cents:          pull.retail_cents,
        currency:              "ZAR",
        status:                "paid",
        payfast_transaction_id: transactionId,
        paid_at:               now,
        metadata:              { pull_id: pullId, product_type: productType, source: "property_intelligence" },
      })
      .select("id")
      .single()

    // Advance pull to 'running' and link payment
    await service
      .from("property_intelligence_pulls")
      .update({ status: "running", payfast_payment_id: payment?.id ?? null })
      .eq("id", pullId)

    // Store tokenisation token for future 1-click adhoc charges (D-14A-19)
    if (pfToken) {
      await service
        .from("organisation_payment_tokens")
        .upsert(
          { org_id: orgId, payfast_token: pfToken, last_4: last4, card_brand: cardBrand },
          { onConflict: "org_id" },
        )
    }

    await service.from("audit_log").insert({
      org_id:     orgId,
      table_name: "property_intelligence_pulls",
      record_id:  pullId,
      action:     "UPDATE",
      new_values: { status: "running", payfast_transaction_id: transactionId },
    })

    // Fire vendor execution (non-blocking — do not await, ITN must return quickly)
    const runUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/property-intelligence/run/${pullId}`
    fetch(runUrl, {
      method:  "POST",
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
    }).catch((e) => console.error("[payfast/property-intelligence] run trigger failed:", e))

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { webhook_type: "payfast_property_intelligence" },
      extra: { pull_id: pullId, org_id: orgId },
    })
    console.error("[payfast/property-intelligence] unhandled error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
