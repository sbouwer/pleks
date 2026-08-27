/**
 * app/api/applications/[id]/documents/upload/route.ts — Validated document upload
 *
 * Route:  POST /api/applications/[id]/documents/upload
 * Auth:   requireAgentWriteAccess
 * Data:   application-docs storage (upload)
 * Notes:  Three-gate validation: extension + MIME + magic bytes (§15.3, D-14L-22).
 *         HEIC conversion happens client-side before this route is called (D-14L-23).
 *         Those three gates validate the FILE. The storage KEY is validated separately, by
 *         pathBelongsToApplication — see the comment at the call site (BUILD_71 D10).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { validateUpload } from "@/lib/extraction/uploadValidator"
import { createServiceClient } from "@/lib/supabase/server"
import { registerApplicationDocument } from "@/lib/applications/documentRegistry"
import { pathBelongsToApplication } from "@/lib/applications/applicationStoragePath"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: applicationId } = await params

    const gw = await requireAgentWriteAccess("upload_application_document")
    const { orgId } = gw

    const formData = await req.formData()
    const file   = formData.get("file")   as File   | null
    const docKey = formData.get("docKey") as string | null

    if (!file)   return NextResponse.json({ error: "No file provided" },   { status: 400 })
    if (!docKey) return NextResponse.json({ error: "No docKey provided" }, { status: 400 })

    const bytes = new Uint8Array(await file.arrayBuffer())

    // Three-gate validation
    const validation = validateUpload(file.name, file.type, bytes)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.userMessage, rejectionReason: validation.rejectionReason },
        { status: 422 },
      )
    }

    const db = await createServiceClient()
    const ext = validation.format === "jpeg" ? "jpg" : validation.format
    const storagePath = `applications/${orgId}/${applicationId}/${docKey}.${ext}`

    // ⚠ docKey is caller-supplied and lands in a STORAGE KEY, uploaded with upsert:true. storage-js
    // does not normalise `..` (it only strips leading/trailing slashes — index.mjs _getFinalPath /
    // _removeEmptyFolders), and the WHATWG URL parser then resolves the segments before fetch sends
    // them: `../../../{otherOrg}/{app}/id_document` demonstrably lands OUTSIDE this org's prefix, and
    // enough segments leave the bucket entirely. This route uses the service client, so RLS on
    // storage.objects is not a backstop either.
    //
    // pathBelongsToApplication already existed for exactly this — but only the applicant-side READ
    // routes called it (detect-document, documents). Reads were bound, writes were not: the same
    // split-aperture shape as the 2026-08-19 read/write scar, one rule short on the other side.
    // Reusing it rather than adding a docKey allowlist keeps ONE authority over what a valid
    // application path is. BUILD_71 D10.
    if (!pathBelongsToApplication(orgId, applicationId, storagePath)) {
      return NextResponse.json({ error: "Invalid document key" }, { status: 400 })
    }

    const { error: uploadError } = await db.storage
      .from("application-docs")
      .upload(storagePath, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      return NextResponse.json({ error: "Storage upload failed" }, { status: 500 })
    }

    // Register in the doc→subject registry (14P 0b). The agent uploads for the primary applicant; co/director
    // agent uploads (a subject param) come with §5b. Best-effort — the loader is storage-complete + defaults primary.
    await registerApplicationDocument(db, { orgId, applicationId, subjectRef: "primary", storagePath, documentType: docKey, uploadedBy: gw.userId })

    return NextResponse.json({ ok: true, storagePath, format: validation.format })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    )
  }
}
