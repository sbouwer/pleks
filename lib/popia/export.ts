/**
 * lib/popia/export.ts — POPIA export bundle generation (access / portability / nuke-pre-delivery)
 *
 * Auth:   Service-role only — never import in client components
 * Data:   popia_exports, popia-exports bucket, data_subject_requests
 * Notes:  D-POPIA-11: PDF + JSON + ZIP, SHA-256 manifest-hash tamper evidence.
 *         D-POPIA-12: never mutates existing exports — regenerate appends a new row.
 *         AI narrative (generateAccessNarrative) is optional; Firm-tier default on.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { generateBundle, signedDownloadUrl } from "@/lib/exports/bundle"
import type { DataSubjectRequest } from "./requests"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportOptions {
  include_ai_narrative?: boolean
  ttl_seconds?: number   // signed URL TTL — defaults to 7 days
}

export interface PopiaExport {
  id: string
  pdf_storage_path: string
  json_storage_path: string
  zip_storage_path: string | null
  manifest_hash: string
  manifest_summary: {
    artefact_hashes: Record<string, string>
    total_bytes: number
  }
  expires_at: string
  signed_pdf_url: string
  signed_json_url: string
  signed_zip_url: string | null
}

export interface SubjectDataBundle {
  subject_email: string
  subject_name: string | null
  org_name: string
  leases: unknown[]
  communications_count: number
  inspections: unknown[]
  payments: unknown[]
  consent_entries: unknown[]
}

// ─── Generate ─────────────────────────────────────────────────────────────────

/**
 * Generates PDF + JSON artefacts, uploads to popia-exports bucket, writes
 * popia_exports row, returns signed download URLs.
 */
export async function generateExport(
  request: DataSubjectRequest,
  actorUserId: string,
  options: ExportOptions = {},
): Promise<PopiaExport> {
  const db = createServiceClient()
  const ttl = options.ttl_seconds ?? 7 * 24 * 60 * 60

  // 1. Gather subject data
  const bundle = await gatherSubjectData(await db, request)

  // 2. AI narrative (optional)
  let narrative: string | null = null
  if (options.include_ai_narrative) {
    try {
      narrative = await generateAccessNarrative(bundle)
    } catch {
      // Non-fatal — structured export still generated without narrative
    }
  }

  // 3. Build JSON artefact
  const jsonPayload = {
    schema_version: "2026.1",
    generated_at: new Date().toISOString(),
    subject_email: request.subject_email,
    controller_org_id: request.org_id,
    request_id: request.id,
    request_type: request.request_type,
    data: bundle,
    ...(narrative ? { ai_narrative: narrative } : {}),
  }
  const jsonBytes = Buffer.from(JSON.stringify(jsonPayload, null, 2), "utf-8")

  // 4. Build PDF artefact (placeholder — full PDF via @react-pdf in Phase 7)
  const pdfBytes = await buildPdfArtefact(bundle, narrative)

  // 5. Upload via shared bundle library
  const pathPrefix = `${request.org_id}/${request.subject_user_id ?? slugEmail(request.subject_email)}/${crypto.randomUUID()}`

  const artefacts = [
    { name: "report.pdf", content_type: "application/pdf" as const, bytes: pdfBytes },
    { name: "data.json", content_type: "application/json" as const, bytes: jsonBytes },
  ]

  const bundleResult = await generateBundle(artefacts, "popia-exports", pathPrefix)

  // 6. Write popia_exports row
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
  const { data: exportRow, error } = await (await db)
    .from("popia_exports")
    .insert({
      org_id: request.org_id,
      controller_role: "agency_operator",
      subject_user_id: request.subject_user_id,
      subject_email: request.subject_email,
      request_id: request.id,
      export_type: request.request_type === "nuke" ? "nuke_predelivery" : request.request_type,
      pdf_storage_path: bundleResult.storage_paths["report.pdf"],
      json_storage_path: bundleResult.storage_paths["data.json"],
      zip_storage_path: null,
      manifest_hash: bundleResult.manifest_hash,
      manifest_summary: {
        artefact_hashes: bundleResult.artefact_hashes,
        total_bytes: bundleResult.total_bytes,
      },
      generated_by: actorUserId,
      expires_at: expiresAt,
    })
    .select("id, pdf_storage_path, json_storage_path, zip_storage_path, manifest_hash, manifest_summary, expires_at")
    .single()

  if (error || !exportRow) {
    throw new Error(`[popia/export] insert failed: ${error?.message ?? "unknown"}`)
  }

  // 7. Link export to request
  await (await db)
    .from("data_subject_requests")
    .update({ export_id: exportRow.id })
    .eq("id", request.id)

  // 8. Sign download URLs
  const [signedPdf, signedJson] = await Promise.all([
    signedDownloadUrl("popia-exports", exportRow.pdf_storage_path, ttl),
    signedDownloadUrl("popia-exports", exportRow.json_storage_path, ttl),
  ])

  return {
    id: exportRow.id,
    pdf_storage_path: exportRow.pdf_storage_path,
    json_storage_path: exportRow.json_storage_path,
    zip_storage_path: exportRow.zip_storage_path,
    manifest_hash: exportRow.manifest_hash,
    manifest_summary: exportRow.manifest_summary as { artefact_hashes: Record<string, string>; total_bytes: number },
    expires_at: exportRow.expires_at,
    signed_pdf_url: signedPdf,
    signed_json_url: signedJson,
    signed_zip_url: null,
  }
}

// ─── Regenerate ───────────────────────────────────────────────────────────────

export async function regenerateExport(
  originalExportId: string,
  reason: string,
  actorUserId: string,
  request: DataSubjectRequest,
  options: ExportOptions = {},
): Promise<PopiaExport> {
  const newExport = await generateExport(request, actorUserId, options)

  // Mark regeneration lineage on the new row
  const db = createServiceClient()
  await (await db)
    .from("popia_exports")
    .update({ regeneration_of: originalExportId, regeneration_reason: reason })
    .eq("id", newExport.id)

  return newExport
}

// ─── Download tracking ────────────────────────────────────────────────────────

export async function recordDownload(exportId: string): Promise<void> {
  const db = createServiceClient()
  const { data: current, error: currentError } = await (await db)
    .from("popia_exports")
    .select("download_count, downloaded_at")
    .eq("id", exportId)
    .single()
    logQueryError("recordDownload popia_exports", currentError)

  await (await db)
    .from("popia_exports")
    .update({
      download_count: (current?.download_count ?? 0) + 1,
      ...(current?.downloaded_at ? {} : { downloaded_at: new Date().toISOString() }),
    })
    .eq("id", exportId)
}

// ─── AI narrative ─────────────────────────────────────────────────────────────

/**
 * Optional: generates a natural-language summary of what's held about the subject.
 * Calls lib/ai/client.ts with purpose='popia_export_narrative'.
 * Non-fatal — caller must catch and proceed with structured export on failure.
 */
export async function generateAccessNarrative(bundle: SubjectDataBundle): Promise<string> {
  const { createMessage } = await import("@/lib/ai/client")

  const prompt = `You are generating a clear, professional privacy disclosure narrative for a data subject access request under POPIA (South Africa's Protection of Personal Information Act).

The subject is ${bundle.subject_name ?? bundle.subject_email}. The agency is ${bundle.org_name}.

Data held:
- Active and historical leases: ${bundle.leases.length} records
- Communications: ${bundle.communications_count} entries
- Inspections: ${bundle.inspections.length} records
- Payment records: ${bundle.payments.length} entries
- Consent log entries: ${bundle.consent_entries.length} records

Write 2–3 paragraphs summarising what the agency holds, when the relationship began (if determinable), and the data categories. Do not include specific identifying values like addresses or amounts. Keep the tone factual and professional — no legal jargon. Start with "Your data held by ${bundle.org_name} through Pleks includes the following:"`

  const result = await createMessage(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    },
    { orgId: null, purpose: "popia_export_narrative" },
  )

  const content = result.message.content[0]
  return content.type === "text" ? content.text : ""
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function gatherSubjectData(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  request: DataSubjectRequest,
): Promise<SubjectDataBundle> {
  const { data: org, error: orgError } = await db
    .from("organisations")
    .select("name")
    .eq("id", request.org_id)
    .single()
    logQueryError("gatherSubjectData organisations", orgError)

  const { data: leases, error: leasesError } = await db
    .from("leases")
    .select("id, start_date, end_date, status, monthly_rental:rent_amount_cents")
    .eq("org_id", request.org_id)
    .in(
      "id",
      (await db
        .from("lease_parties")
        .select("lease_id")
        .eq("org_id", request.org_id)
        .eq("user_id", request.subject_user_id ?? "")).data?.map(
          (r: { lease_id: string }) => r.lease_id,
        ) ?? [],
    )
    logQueryError("gatherSubjectData leases", leasesError)

  const { count: communications_count } = await db
    .from("communication_log")
    .select("id", { count: "exact", head: true })
    .eq("org_id", request.org_id)
    .eq("user_id", request.subject_user_id ?? "")

  const { data: inspections, error: inspectionsError } = await db
    .from("inspections")
    .select("id, inspection_type, inspection_date:conducted_date, outcome:overall_condition")
    .eq("org_id", request.org_id)
    .in(
      "lease_id",
      (leases ?? []).map((l: { id: string }) => l.id),
    )
    logQueryError("gatherSubjectData inspections", inspectionsError)

  const { data: consent_entries, error: consent_entriesError } = await db
    .from("consent_log")
    .select("consent_type, consent_version, consent_given, created_at")
    .eq("user_id", request.subject_user_id ?? "")
    .order("created_at", { ascending: false })
    logQueryError("gatherSubjectData consent_log", consent_entriesError)

  return {
    subject_email: request.subject_email,
    subject_name: request.subject_full_name,
    org_name: org?.name ?? "Agency",
    leases: leases ?? [],
    communications_count: communications_count ?? 0,
    inspections: inspections ?? [],
    payments: [],  // Payment data gathered separately in Phase 7 when PDF is built
    consent_entries: consent_entries ?? [],
  }
}

async function buildPdfArtefact(
  bundle: SubjectDataBundle,
  narrative: string | null,
): Promise<Buffer> {
  // Phase 7 replaces this with a full @react-pdf render (same pattern as TrustAuditPdf).
  // For Phase 1 the PDF is a minimal UTF-8 text document so the bundle and manifest
  // hash work end-to-end without requiring PDF renderer setup.
  const text = [
    "PLEKS — DATA SUBJECT ACCESS REQUEST REPORT",
    "==========================================",
    "",
    `Subject: ${bundle.subject_name ?? bundle.subject_email}`,
    `Agency: ${bundle.org_name}`,
    `Generated: ${new Date().toUTCString()}`,
    "",
    ...(narrative ? [`SUMMARY\n-------\n${narrative}`, ""] : []),
    "DATA HELD",
    "---------",
    `Leases: ${bundle.leases.length}`,
    `Communications: ${bundle.communications_count}`,
    `Inspections: ${bundle.inspections.length}`,
    `Consent log entries: ${bundle.consent_entries.length}`,
    "",
    "Full structured data is available in the accompanying data.json file.",
    "",
    "This report was generated automatically by Pleks. For questions, contact your",
    "agency's Information Officer or Pleks at privacy@pleks.co.za.",
  ].join("\n")

  return Buffer.from(text, "utf-8")
}

function slugEmail(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 40)
}
