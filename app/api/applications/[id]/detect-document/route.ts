/**
 * app/api/applications/[id]/detect-document/route.ts — Haiku document type detection
 *
 * Route:  POST /api/applications/[id]/detect-document
 * Auth:   Service role (internal — triggered from document upload flow)
 * Data:   application-docs storage bucket; Anthropic API via lib/ai/client.ts
 * Notes:  Images only — PDFs fall through to key-based classification.
 *         Triggers bank statement extraction when bank_statement detected.
 *         Genuinely password-locked PDFs are rejected here (422) so the applicant gets immediate feedback;
 *         empty-password PDFs (the common bank-statement case) pass — the screen pipeline decrypts them.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createMessage } from "@/lib/ai/client"
import { isProtectedPdf } from "@/lib/extraction/uploadValidator"
import { decryptProtectedPdf } from "@/lib/extraction/pdfDecrypt"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** 422 response if the PDF needs a real password to open; null if it's clean or empty-password (decryptable). */
async function passwordLockedResponse(bytes: Uint8Array): Promise<NextResponse | null> {
  if (!isProtectedPdf(bytes)) return null
  const decrypted = await decryptProtectedPdf(bytes)
  if (!decrypted.ok && decrypted.reason === "password-required") {
    return NextResponse.json({
      error: "password_protected",
      message: "This PDF needs a password to open. Please save an unprotected copy (open it, then File → Print → Save as PDF, or remove the password) and upload that.",
    }, { status: 422 })
  }
  return null
}

interface Props { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  const { id } = await params
  const body = await req.json() as { path: string; docKey: string }
  const service = getServiceClient()

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
    if (isImage) {
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
        void triggerBankExtraction(id, body.path)
      }

      return NextResponse.json({
        documentType: parsed.document_type,
        confidence: parsed.confidence,
        summary: parsed.details,
      })
    } else {
      // PDF: reject a genuinely password-locked file up front (empty-password PDFs decrypt fine downstream).
      const locked = await passwordLockedResponse(new Uint8Array(await fileData.arrayBuffer()))
      if (locked) return locked
      return NextResponse.json({
        documentType: body.docKey.replace(/_\d$/, ""),
        confidence: 0.8,
        summary: "PDF uploaded successfully",
      })
    }
  } catch {
    return NextResponse.json({ documentType: "unknown", confidence: 0, summary: null })
  }
}

async function triggerBankExtraction(applicationId: string, path: string) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/applications/${applicationId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankStatementPath: path }),
    })
  } catch { /* non-fatal */ }
}
