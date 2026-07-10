/**
 * app/api/property-intelligence/run/[pull_id]/route.ts — Vendor execution, PDF, storage, cost logging
 *
 * Route:  POST /api/property-intelligence/run/[pull_id]
 * Auth:   x-internal-secret header (called by ITN webhook, not by client directly)
 * Data:   property_intelligence_pulls, vendor_usage, audit_log, payments (refund on failure)
 * Notes:  ADDENDUM_14A (Phase 3 + Phase 8) + ADDENDUM_14H (Phase 3).
 *         Dispatches the correct Searchworx product call (new searchworxCall envelope per 14H).
 *         On success: downloads Searchworx PDF to screening-reports + Pleks-branded PDF to property-intelligence.
 *         On vendor error: marks pull failed, initiates PayFast refund (not on no_data — billable per §6 D-14H-18).
 *         Idempotent: if pull is already complete/failed/no_data_found, returns immediately.
 *         F6 fix (14H §8.2): uses auth.admin.getUserById() not auth.users table query.
 */
import { NextRequest, NextResponse } from "next/server"
import { createElement } from "react"
import * as Sentry from "@sentry/nextjs"
import { renderToBuffer } from "@react-pdf/renderer"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/server"
import { runDeedsSearch }        from "@/lib/searchworx/products/deedsSearch"
import { runLightstoneErfShort } from "@/lib/searchworx/products/lightstoneErfShort"
import { runCipcCompany }        from "@/lib/searchworx/products/cipcCompany"
import { runCipcDirector }       from "@/lib/searchworx/products/cipcDirector"
import { downloadAndStoreSearchworxArtefact } from "@/lib/searchworx/storage"
import { refundPayment }         from "@/lib/payfast/adhoc"
import { IntelligenceReportPdf, type IntelligenceReportData } from "@/lib/property-intelligence/IntelligenceReportPdf"
import { PRODUCT_LABELS } from "@/lib/property-intelligence/types"
import { SearchworxError, type SearchworxResult } from "@/lib/searchworx/client"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { optionalEnv } from "@/lib/env"

// ─── Product dispatch ─────────────────────────────────────────────────────────

async function dispatchProduct(
  productType: string,
  subjectId: string,
): Promise<SearchworxResult<unknown>> {
  switch (productType) {
    case "deeds_search": {
      const [erfNumber, municipality] = subjectId.split("|")
      return runDeedsSearch({ erfNumber: erfNumber ?? subjectId, municipality: municipality ?? "" })
    }
    case "lightstone_erf_short": {
      const [erfNumber, municipality] = subjectId.split("|")
      return runLightstoneErfShort({ erfNumber: erfNumber ?? subjectId, municipality: municipality ?? "" })
    }
    case "cipc_company":
      return runCipcCompany({ registrationNumber: subjectId })
    case "cipc_director": {
      const [idNumber, surname, firstName, registrationNumber] = subjectId.split("|")
      return runCipcDirector({
        idNumber:           idNumber ?? subjectId,
        surname:            surname ?? "",
        firstName:          firstName ?? "",
        registrationNumber: registrationNumber ?? "",
      })
    }
    default:
      return {
        ok:    false,
        error: new SearchworxError(`Unknown product type: ${productType}`, "unknown", `Unknown product type: ${productType}`),
      }
  }
}

// ─── Failure path ─────────────────────────────────────────────────────────────

type PullRow = {
  org_id: unknown; payfast_payment_id: unknown; retail_cents: unknown; cost_cents: unknown
}

async function handleVendorFailure(
  service: SupabaseClient,
  pull: PullRow,
  error: SearchworxError,
  pullId: string,
  productType: string,
  subjectId: string,
  now: string,
): Promise<"no_data_found" | "failed"> {
  const isNoData  = error.category === "no_data"
  const newStatus = isNoData ? ("no_data_found" as const) : ("failed" as const)

  await service.from("property_intelligence_pulls").update({
    status:                    newStatus,
    failure_reason:            error.message,
    failed_at:                 isNoData ? null : now,
    completed_at:              isNoData ? now : null,
    searchworx_response_jsonb: { error: error.message, category: error.category },
  }).eq("id", pullId)

  await service.from("audit_log").insert({
    org_id:     pull.org_id,
    table_name: "property_intelligence_pulls",
    record_id:  pullId,
    action:     "UPDATE",
    new_values: { status: newStatus, failure_reason: error.message },
  })

  if (!isNoData && pull.payfast_payment_id) {
    const refundRes = await refundPayment(
      pull.payfast_payment_id as string,
      pull.retail_cents as number,
      "Searchworx vendor error",
    )
    await service.from("property_intelligence_pulls")
      .update({ refunded_at: refundRes.ok ? now : null }).eq("id", pullId)
    if (!refundRes.ok) {
      Sentry.captureMessage("[pi/run] PayFast refund failed", {
        level: "error",
        extra: { pull_id: pullId, org_id: pull.org_id, error: refundRes.errorMessage },
      })
    }
  }

  if (isNoData) {
    await service.from("vendor_usage").insert({
      org_id:       pull.org_id,
      vendor:       "searchworx",
      product_key:  productType,
      cost_cents:   pull.cost_cents,
      retail_cents: pull.retail_cents,
      ref_table:    "property_intelligence_pulls",
      ref_id:       pullId,
      metadata:     { subject_identifier: subjectId, product_type: productType, outcome: "no_data" },
    })
  }

  return newStatus
}

// ─── PDF download helper ──────────────────────────────────────────────────────

async function tryDownloadSearchworxPdf(
  pdfCopyUrl: string,
  orgId: string,
  pullId: string,
  productType: string,
): Promise<string | null> {
  try {
    const result = await downloadAndStoreSearchworxArtefact({
      vendorUrl:    pdfCopyUrl,
      orgId,
      refId:        pullId,
      productKey:   productType,
      searchToken:  pullId,
      artefactKind: "pdf",
      mimeType:     "application/pdf",
    })
    return result.storagePath
  } catch (err) {
    console.error("[pi/run] Searchworx PDF download failed:", err)
    Sentry.captureException(err, {
      tags:  { route: "property-intelligence/run", step: "pdf_download" },
      extra: { pull_id: pullId },
    })
    return null
  }
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pull_id: string }> },
) {
  const secret = req.headers.get("x-internal-secret")
  if (!secret || secret !== optionalEnv("INTERNAL_API_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { pull_id: pullId } = await params
  const service = await createServiceClient()
  const now     = new Date().toISOString()

  try {
    const { data: pull, error: pullErr } = await service
      .from("property_intelligence_pulls")
      .select(`id, org_id, product_type, subject_identifier, subject_label,
               property_id, landlord_id, status, retail_cents, cost_cents,
               payfast_payment_id, created_by_user_id`)
      .eq("id", pullId)
      .single()

    if (pullErr || !pull) {
      console.error("[pi/run] pull not found:", pullId, pullErr?.message)
      return NextResponse.json({ error: "Pull not found" }, { status: 404 })
    }
    if (pull.status !== "running") {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const { data: org, error: orgError } = await service
      .from("organisations").select("name, trading_as").eq("id", pull.org_id as string).single()
    logQueryError("POST organisations", orgError)

    const { data: { user } } = await service.auth.admin.getUserById(pull.created_by_user_id as string)
    const pulledByEmail = user?.email ?? "agent"

    const productType  = pull.product_type as string
    const subjectId    = pull.subject_identifier as string
    const vendorResult = await dispatchProduct(productType, subjectId)

    if (!vendorResult.ok) {
      const status = await handleVendorFailure(service, pull, vendorResult.error, pullId, productType, subjectId, now)
      return NextResponse.json({ ok: true, status })
    }

    // ── Success path ──────────────────────────────────────────────────────────
    const facts = vendorResult.data

    const searchworxPath = vendorResult.pdfCopyUrl
      ? await tryDownloadSearchworxPdf(vendorResult.pdfCopyUrl, pull.org_id as string, pullId, productType)
      : null

    const productLabel = PRODUCT_LABELS[productType] ?? productType
    const orgName      = org?.trading_as ?? org?.name ?? "Unknown Agency"
    const reportData: IntelligenceReportData = {
      orgName, productType, productLabel,
      subjectLabel:  (pull.subject_label as string) ?? subjectId,
      pulledByEmail, pulledAt: now,
      facts: facts as IntelligenceReportData["facts"],
    }

    const pdfBuffer = Buffer.from(
      await renderToBuffer(
        createElement(IntelligenceReportPdf, { d: reportData }) as unknown as Parameters<typeof renderToBuffer>[0],
      ),
    )

    const pleksPath = `${pull.org_id}/${pullId}.pdf`
    const { error: uploadErr } = await service.storage
      .from("property-intelligence")
      .upload(pleksPath, pdfBuffer, { contentType: "application/pdf", upsert: true })

    if (uploadErr) console.error("[pi/run] Pleks PDF upload failed:", uploadErr.message)

    await service.from("property_intelligence_pulls").update({
      status:                    "complete",
      completed_at:              now,
      searchworx_response_jsonb: facts,
      extracted_facts_jsonb:     facts,
      pdf_storage_path:          uploadErr ? null : pleksPath,
      ...(searchworxPath ? { searchworx_pdf_storage_path: searchworxPath } : {}),
    }).eq("id", pullId)

    const payfastFeeCents = Math.round((pull.retail_cents as number) * 0.035 + 200)
    await service.from("vendor_usage").insert([
      {
        org_id:       pull.org_id, vendor: "searchworx", product_key: productType,
        cost_cents:   pull.cost_cents, retail_cents: pull.retail_cents,
        ref_table:    "property_intelligence_pulls", ref_id: pullId,
        metadata:     { subject_identifier: subjectId, product_type: productType },
      },
      {
        org_id:       pull.org_id, vendor: "payfast", product_key: "transaction_fee",
        cost_cents:   payfastFeeCents, retail_cents: null,
        ref_table:    "property_intelligence_pulls", ref_id: pullId,
        metadata:     { note: "estimated; 3.5% + R2" },
      },
    ])

    await service.from("audit_log").insert({
      org_id:     pull.org_id, table_name: "property_intelligence_pulls",
      record_id:  pullId, action: "UPDATE",
      new_values: { status: "complete", pdf_storage_path: pleksPath },
    })

    return NextResponse.json({ ok: true, status: "complete" })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "property-intelligence/run" }, extra: { pull_id: pullId } })
    console.error("[pi/run] unhandled error:", err)
    await service.from("property_intelligence_pulls")
      .update({ status: "failed", failure_reason: "Internal error", failed_at: now })
      .eq("id", pullId).eq("status", "running")
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
