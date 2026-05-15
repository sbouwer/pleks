/**
 * app/api/property-intelligence/initiate/route.ts — Create a pull row and decide checkout vs 1-click
 *
 * Route:  POST /api/property-intelligence/initiate
 * Auth:   gateway() — agent workspace (property_intelligence tier gate enforced here)
 * Data:   property_intelligence_pulls (insert), organisation_payment_tokens (read)
 * Notes:  ADDENDUM_14A. Returns one of two shapes:
 *         { mode: "checkout", formData } — no saved card; client renders <PayFastForm>
 *         { mode: "adhoc", pullId }      — saved card; client POSTs to /run/[pullId] directly
 *         Recent-pull suppression check (30-day window per D-14A-05) runs before insert.
 *         Tier gate: property_intelligence must be in org's feature set (Steward+).
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { gateway } from "@/lib/supabase/gateway"
import { hasFeature } from "@/lib/tier/gates"
import type { Tier } from "@/lib/constants"
import { buildPropertyIntelligenceFeeForm, PI_RETAIL_CENTS, PI_COST_CENTS } from "@/lib/payfast/forms"
import { chargeAdhoc } from "@/lib/payfast/adhoc"
import { createServiceClient } from "@/lib/supabase/server"

const VALID_PRODUCT_TYPES = ["deeds_search", "lightstone_erf_short", "cipc_company", "cipc_director"] as const
type ProductType = typeof VALID_PRODUCT_TYPES[number]

const SUPPRESSION_DAYS = 30

export async function POST(req: NextRequest) {
  try {
    const gw = await gateway()
    if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { db, orgId, userId, tier } = gw

    if (!hasFeature((tier ?? "owner") as Tier, "property_intelligence")) {
      return NextResponse.json({ error: "Property Intelligence requires Steward tier or above" }, { status: 403 })
    }

    const body = await req.json() as {
      productType?:       string
      subjectIdentifier?: string
      subjectLabel?:      string
      propertyId?:        string
      landlordId?:        string
      forceRun?:          boolean
    }

    const { productType, subjectIdentifier, subjectLabel, propertyId, landlordId, forceRun } = body

    if (!productType || !subjectIdentifier) {
      return NextResponse.json({ error: "productType and subjectIdentifier are required" }, { status: 400 })
    }
    if (!VALID_PRODUCT_TYPES.includes(productType as ProductType)) {
      return NextResponse.json({ error: "Invalid productType" }, { status: 400 })
    }

    const retailCents = PI_RETAIL_CENTS[productType]
    const costCents   = PI_COST_CENTS[productType]

    // Recent-pull suppression (D-14A-05): 30-day window per product + subject
    if (!forceRun) {
      const cutoff = new Date(Date.now() - SUPPRESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      const { data: recent } = await db
        .from("property_intelligence_pulls")
        .select("id, created_at, status")
        .eq("org_id", orgId)
        .eq("product_type", productType)
        .eq("subject_identifier", subjectIdentifier)
        .eq("status", "complete")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recent) {
        return NextResponse.json({
          suppressed:     true,
          recentPullId:   recent.id,
          recentPullDate: recent.created_at,
        })
      }
    }

    // Insert pull row in pending state
    const { data: pull, error: pullErr } = await db
      .from("property_intelligence_pulls")
      .insert({
        org_id:             orgId,
        product_type:       productType,
        property_id:        propertyId ?? null,
        landlord_id:        landlordId ?? null,
        subject_identifier: subjectIdentifier,
        subject_label:      subjectLabel ?? subjectIdentifier,
        status:             "pending",
        retail_cents:       retailCents,
        cost_cents:         costCents,
        created_by_user_id: userId,
      })
      .select("id")
      .single()

    if (pullErr || !pull) {
      console.error("[pi/initiate] insert failed:", pullErr?.message)
      return NextResponse.json({ error: "Failed to create pull" }, { status: 500 })
    }

    // Check for saved card (service client — bypasses RLS on this read)
    const service = await createServiceClient()
    const { data: savedToken } = await service
      .from("organisation_payment_tokens")
      .select("payfast_token")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (savedToken?.payfast_token) {
      // 1-click adhoc charge path
      const label    = subjectLabel ?? subjectIdentifier
      const chargeRes = await chargeAdhoc(
        savedToken.payfast_token,
        retailCents,
        `${productType.replace(/_/g, " ")} — ${label}`,
      )

      if (!chargeRes.ok) {
        // Adhoc charge failed — fall back to checkout form
        console.warn("[pi/initiate] adhoc charge failed, falling back to checkout:", chargeRes.errorMessage)
        const form = buildPropertyIntelligenceFeeForm({
          pullId:       pull.id,
          orgId,
          productType,
          subjectLabel: label,
          tokenise:     false,
        })
        return NextResponse.json({ mode: "checkout", pullId: pull.id, ...form })
      }

      // Adhoc succeeded — advance pull to running and trigger vendor call
      await service
        .from("property_intelligence_pulls")
        .update({ status: "running" })
        .eq("id", pull.id)

      await service.from("audit_log").insert({
        org_id:     orgId,
        table_name: "property_intelligence_pulls",
        record_id:  pull.id,
        action:     "UPDATE",
        new_values: { status: "running", charge_mode: "adhoc", payfast_id: chargeRes.payfastId },
      })

      return NextResponse.json({ mode: "adhoc", pullId: pull.id })
    }

    // No saved card — return PayFast checkout form (with tokenise=true for first-time card save)
    const form = buildPropertyIntelligenceFeeForm({
      pullId:       pull.id,
      orgId,
      productType,
      subjectLabel: subjectLabel ?? subjectIdentifier,
      tokenise:     true,
    })

    return NextResponse.json({ mode: "checkout", pullId: pull.id, ...form })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "property-intelligence/initiate" } })
    console.error("[pi/initiate] unhandled error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
