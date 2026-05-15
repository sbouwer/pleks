/**
 * app/api/property-intelligence/run/[pull_id]/route.ts — Vendor execution, PDF, storage, cost logging
 *
 * Route:  POST /api/property-intelligence/run/[pull_id]
 * Auth:   x-internal-secret header (called by ITN webhook, not by client directly)
 * Data:   property_intelligence_pulls, vendor_usage, audit_log, payments (refund on failure)
 * Notes:  ADDENDUM_14A (Phase 3 + Phase 8). Dispatches the correct Searchworx product call,
 *         parses extracted_facts_jsonb, generates PDF via React PDF, uploads to
 *         property-intelligence/{orgId}/{pullId}.pdf, writes vendor_usage rows (D-14A-18).
 *         On Searchworx failure: marks pull failed, initiates PayFast refund (lib/payfast/adhoc).
 *         Idempotent: if pull is already complete/failed, returns immediately.
 */
import { NextRequest, NextResponse } from "next/server"
import { createElement } from "react"
import * as Sentry from "@sentry/nextjs"
import { renderToBuffer } from "@react-pdf/renderer"
import { createServiceClient } from "@/lib/supabase/server"
import { runDeedsSearch }        from "@/lib/searchworx/products/deedsSearch"
import { runLightstoneErfShort } from "@/lib/searchworx/products/lightstoneErfShort"
import { runCipcCompany }        from "@/lib/searchworx/products/cipcCompany"
import { runCipcDirector }       from "@/lib/searchworx/products/cipcDirector"
import { refundPayment }         from "@/lib/payfast/adhoc"
import { IntelligenceReportPdf, type IntelligenceReportData } from "@/lib/property-intelligence/IntelligenceReportPdf"
import { PRODUCT_LABELS } from "@/lib/property-intelligence/types"
import type { SearchworxResult } from "@/lib/searchworx/client"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pull_id: string }> },
) {
  const secret = req.headers.get("x-internal-secret")
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { pull_id: pullId } = await params

  const service = await createServiceClient()
  const now     = new Date().toISOString()

  try {
    // Load pull row
    const { data: pull, error: pullErr } = await service
      .from("property_intelligence_pulls")
      .select(`
        id, org_id, product_type, subject_identifier, subject_label,
        property_id, landlord_id, status, retail_cents, cost_cents,
        payfast_payment_id, created_by_user_id
      `)
      .eq("id", pullId)
      .single()

    if (pullErr || !pull) {
      console.error("[pi/run] pull not found:", pullId, pullErr?.message)
      return NextResponse.json({ error: "Pull not found" }, { status: 404 })
    }

    // Idempotency guard
    if (pull.status !== "running") {
      return NextResponse.json({ ok: true, skipped: true })
    }

    // Load org name for PDF
    const { data: org } = await service
      .from("organisations")
      .select("name, trading_as")
      .eq("id", pull.org_id as string)
      .single()

    // Load pulling user email for PDF
    const { data: user } = await service
      .from("auth.users")
      .select("email")
      .eq("id", pull.created_by_user_id as string)
      .maybeSingle()

    // ── Dispatch Searchworx product call ──────────────────────────────────────
    let vendorResult: SearchworxResult<unknown>

    const productType = pull.product_type as string
    const subjectId   = pull.subject_identifier as string

    switch (productType) {
      case "deeds_search": {
        // subjectIdentifier format: "ERF_NUMBER|MUNICIPALITY"
        const [erfNumber, municipality] = subjectId.split("|")
        vendorResult = await runDeedsSearch({ erfNumber: erfNumber ?? subjectId, municipality: municipality ?? "" })
        break
      }
      case "lightstone_erf_short": {
        const [erfNumber, municipality] = subjectId.split("|")
        vendorResult = await runLightstoneErfShort({ erfNumber: erfNumber ?? subjectId, municipality: municipality ?? "" })
        break
      }
      case "cipc_company":
        vendorResult = await runCipcCompany({ registrationNumber: subjectId })
        break
      case "cipc_director": {
        // subjectIdentifier format: "ID_NUMBER|REG_NUMBER"
        const [idNumber, registrationNumber] = subjectId.split("|")
        vendorResult = await runCipcDirector({ idNumber: idNumber ?? subjectId, registrationNumber: registrationNumber ?? "" })
        break
      }
      default:
        vendorResult = { ok: false, code: "vendor_error", message: `Unknown product type: ${productType}` }
    }

    // ── Failure path ──────────────────────────────────────────────────────────
    if (!vendorResult.ok) {
      const isNotFound = vendorResult.code === "not_found"
      const newStatus  = isNotFound ? "no_data_found" : "failed"

      await service
        .from("property_intelligence_pulls")
        .update({
          status:         newStatus,
          failure_reason: vendorResult.message,
          failed_at:      isNotFound ? null : now,
          completed_at:   isNotFound ? now : null,
          searchworx_response_jsonb: { error: vendorResult.message, code: vendorResult.code },
        })
        .eq("id", pullId)

      await service.from("audit_log").insert({
        org_id:     pull.org_id,
        table_name: "property_intelligence_pulls",
        record_id:  pullId,
        action:     "UPDATE",
        new_values: { status: newStatus, failure_reason: vendorResult.message },
      })

      // Refund on vendor error (not on no_data_found — charge stands per Searchworx rate card)
      if (!isNotFound && pull.payfast_payment_id) {
        const refundRes = await refundPayment(
          pull.payfast_payment_id as string,
          pull.retail_cents as number,
          "Searchworx vendor error",
        )
        await service
          .from("property_intelligence_pulls")
          .update({ refunded_at: refundRes.ok ? now : null })
          .eq("id", pullId)

        if (!refundRes.ok) {
          console.error("[pi/run] PayFast refund failed:", refundRes.errorMessage)
          Sentry.captureMessage("[pi/run] PayFast refund failed", {
            level: "error",
            extra: { pull_id: pullId, org_id: pull.org_id, error: refundRes.errorMessage },
          })
        }
      }

      return NextResponse.json({ ok: true, status: newStatus })
    }

    // ── Success path ──────────────────────────────────────────────────────────
    const facts = vendorResult.data

    // Generate PDF
    const productLabel = PRODUCT_LABELS[productType] ?? productType
    const orgName      = org?.trading_as ?? org?.name ?? "Unknown Agency"
    const reportData: IntelligenceReportData = {
      orgName,
      productType,
      productLabel,
      subjectLabel: (pull.subject_label as string) ?? subjectId,
      pulledByEmail: (user as { email?: string })?.email ?? "agent",
      pulledAt:    now,
      facts:       facts as IntelligenceReportData["facts"],
    }

    const pdfEl     = createElement(IntelligenceReportPdf, { d: reportData })
    const pdfBuffer = Buffer.from(
      await renderToBuffer(pdfEl as unknown as Parameters<typeof renderToBuffer>[0])
    )

    // Upload PDF to storage
    const storagePath = `${pull.org_id}/${pullId}.pdf`
    const { error: uploadErr } = await service.storage
      .from("property-intelligence")
      .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true })

    if (uploadErr) {
      console.error("[pi/run] PDF upload failed:", uploadErr.message)
    }

    // Update pull to complete
    await service
      .from("property_intelligence_pulls")
      .update({
        status:                    "complete",
        completed_at:              now,
        searchworx_response_jsonb: facts,
        extracted_facts_jsonb:     facts,
        pdf_storage_path:          uploadErr ? null : storagePath,
      })
      .eq("id", pullId)

    // Write vendor_usage rows (D-14A-18) — Searchworx cost + PayFast fee
    const payfastFeeCents = Math.round((pull.retail_cents as number) * 0.035 + 200)
    await service.from("vendor_usage").insert([
      {
        org_id:      pull.org_id,
        vendor:      "searchworx",
        product_key: productType,
        cost_cents:  pull.cost_cents,
        retail_cents: pull.retail_cents,
        ref_table:   "property_intelligence_pulls",
        ref_id:      pullId,
        metadata:    { subject_identifier: subjectId, product_type: productType },
      },
      {
        org_id:      pull.org_id,
        vendor:      "payfast",
        product_key: "transaction_fee",
        cost_cents:  payfastFeeCents,
        retail_cents: null,
        ref_table:   "property_intelligence_pulls",
        ref_id:      pullId,
        metadata:    { note: "estimated; 3.5% + R2" },
      },
    ])

    await service.from("audit_log").insert({
      org_id:     pull.org_id,
      table_name: "property_intelligence_pulls",
      record_id:  pullId,
      action:     "UPDATE",
      new_values: { status: "complete", pdf_storage_path: storagePath },
    })

    return NextResponse.json({ ok: true, status: "complete" })
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { route: "property-intelligence/run" },
      extra: { pull_id: pullId },
    })
    console.error("[pi/run] unhandled error:", err)

    // Mark failed so the UI can surface an error state
    await service
      .from("property_intelligence_pulls")
      .update({ status: "failed", failure_reason: "Internal error", failed_at: now })
      .eq("id", pullId)
      .eq("status", "running")

    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
