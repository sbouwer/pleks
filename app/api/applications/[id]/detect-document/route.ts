/**
 * app/api/applications/[id]/detect-document/route.ts — Haiku document type detection
 *
 * Route:  POST /api/applications/[id]/detect-document
 * Auth:   applicant token bound to THIS application id (lead application_tokens OR co access_token),
 *         validated before any registry write / download / AI call. Was previously ungated. The path is bound
 *         to the token's own SUBJECT folder (pathBelongsToSubject), not merely the application.
 * Data:   application-docs storage bucket; Anthropic API via lib/ai/client.ts
 * Notes:  Images only — PDFs fall through to key-based classification.
 *         NO BYTES TO THE PROCESSOR BEFORE A RECORDED STAGE-1 CONSENT, on any tier (DECISIONS 2026-10-03). The
 *         wizard records consent at "finish documents", after uploads, so during upload this route registers the
 *         file and runs the local password check, and returns the key-based answer without the Haiku call.
 *         Triggers bank statement extraction when bank_statement detected (consented images only).
 *         Genuinely password-locked PDFs are rejected here (422) so the applicant gets immediate feedback;
 *         empty-password PDFs (the common bank-statement case) pass — the screen pipeline decrypts them.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createMessage } from "@/lib/ai/client"
import { isProtectedPdf } from "@/lib/extraction/uploadValidator"
import { decryptProtectedPdf } from "@/lib/extraction/pdfDecrypt"
import { registerApplicationDocument } from "@/lib/applications/documentRegistry"
import { resolveApplicantToken } from "@/lib/applications/verifyApplicantToken"
import { pathBelongsToSubject } from "@/lib/applications/applicationStoragePath"
import { checkAiRateLimit } from "@/lib/ai/rateLimit"
import { SUPABASE_URL, requireEnv } from "@/lib/env"
import { absoluteUrl } from "@/lib/routing/absoluteUrl"

function getServiceClient() {
  return createClient(
    SUPABASE_URL,
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )
}

/** 422 response if an encrypted PDF can't be read (real password, or otherwise un-decryptable); null if it's
 *  clean or an empty-password PDF we successfully decrypted (those proceed — the screen pipeline re-decrypts). */
async function passwordLockedResponse(bytes: Uint8Array): Promise<NextResponse | null> {
  if (!isProtectedPdf(bytes)) return null
  const decrypted = await decryptProtectedPdf(bytes)
  if (decrypted.ok) return null
  const message = decrypted.reason === "password-required"
    ? "This PDF needs a password to open. Please save an unprotected copy (open it, then File → Print → Save as PDF, or remove the password) and upload that."
    : "We couldn't read this PDF — it appears to be encrypted or corrupted. Please save a fresh, unprotected copy and upload that."
  return NextResponse.json({ error: "password_protected", message }, { status: 422 })
}

interface Props { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  const { id } = await params
  const body = await req.json() as { path: string; docKey: string; token?: string }
  const service = getServiceClient()

  // Auth: an applicant token bound to THIS application (lead or co). Validate BEFORE any registry write,
  // file download, or AI call — nothing expensive or state-changing runs unauthenticated.
  const caller = await resolveApplicantToken(service, body.token, id)
  if (!caller) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  }

  // Resolve the application's REAL org from the DB — NEVER from the client-supplied path — and BIND body.path to
  // the caller's OWN storage folder. Without this, a token holder could pass another org's path
  // (applications/{victimOrg}/{victimApp}/…) to the RLS-bypassing download() below and read cross-tenant bank
  // statements / IDs / payslips (hotfix 2026-07-07), or — bound only to the application — a peer's file (scout R4).
  const { data: app, error: appErr } = await service.from("applications").select("org_id").eq("id", id).maybeSingle()
  const orgId = app?.org_id as string | undefined
  if (appErr || !orgId || !pathBelongsToSubject(orgId, id, caller.subject, body.path)) {
    return NextResponse.json({ error: "Invalid document path" }, { status: 403 })
  }

  // Rate limit (denial-of-wallet): a token holder could otherwise spam Haiku detections. Cap per application/hour.
  if (!(await checkAiRateLimit(service, `detect-document:${id}`, 30, 60)).allowed) {
    return NextResponse.json({ error: "Too many document scans — please wait a moment and try again." }, { status: 429 })
  }

  // Register in the doc→subject registry (14P 0b). The subject is the token's own — the path was bound to it above.
  const subjectRef = caller.subject.kind === "co" ? `co_${caller.subject.coId}` : "primary"
  await registerApplicationDocument(service, { orgId, applicationId: id, subjectRef, storagePath: body.path, documentType: body.docKey, uploadedBy: subjectRef === "primary" ? "applicant" : subjectRef })

  // Download file from storage
  const { data: fileData, error } = await service.storage
    .from("application-docs")
    .download(body.path)

  if (error || !fileData) {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }

  const ext = body.path.split(".").pop()?.toLowerCase() ?? "pdf"
  const isImage = ["jpg", "jpeg", "png"].includes(ext)

  try {
    // PDF: reject a genuinely password-locked file up front (empty-password PDFs decrypt fine downstream). Local.
    if (!isImage) {
      const locked = await passwordLockedResponse(new Uint8Array(await fileData.arrayBuffer()))
      return locked ?? keyBasedAnswer(body.docKey, "PDF uploaded successfully")
    }
    // A processor sees an image only after this subject's stage-1 consent is recorded; until then it gets the
    // same key-based answer a PDF does.
    if (!caller.stage1ConsentGiven) return keyBasedAnswer(body.docKey, "Image uploaded successfully")

    const buffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const mediaType = ext === "png" ? "image/png" : "image/jpeg"

    const { message: response } = await createMessage(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text: `Identify this document. Respond ONLY as JSON with no markdown:
{"document_type":"sa_id"|"passport"|"payslip"|"bank_statement"|"employment_letter"|"other","confidence":0.0,"details":"brief description max 60 chars"}`,
            },
          ],
        }],
      },
      { orgId: null, purpose: "document_detection" },
    )

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const parsed = JSON.parse(text.trim()) as { document_type: string; confidence: number; details: string }

    // If bank statement: trigger Sonnet extraction
    if (parsed.document_type === "bank_statement" || body.docKey === "bank_statement") {
      void triggerBankExtraction(id, body.path, body.token)
    }

    return NextResponse.json({
      documentType: parsed.document_type,
      confidence: parsed.confidence,
      summary: parsed.details,
    })
  } catch {
    return NextResponse.json({ documentType: "unknown", confidence: 0, summary: null })
  }
}

/** The answer when no processor runs: the slot the applicant chose is the document type. */
function keyBasedAnswer(docKey: string, summary: string): NextResponse {
  return NextResponse.json({ documentType: docKey.replace(/_\d$/, ""), confidence: 0.8, summary })
}

async function triggerBankExtraction(applicationId: string, path: string, token: string | undefined) {
  try {
    // Forward the applicant token — /documents re-validates it (token bound to this application).
    await fetch(absoluteUrl(`/api/applications/${applicationId}/documents`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankStatementPath: path, token }),
    })
  } catch { /* non-fatal */ }
}
