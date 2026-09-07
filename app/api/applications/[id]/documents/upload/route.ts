/**
 * app/api/applications/[id]/documents/upload/route.ts — Validated document upload
 *
 * Route:  POST /api/applications/[id]/documents/upload
 * Auth:   requireAgentWriteAccess
 * Data:   application-docs storage (upload)
 * Notes:  Three-gate validation: extension + MIME + magic bytes (§15.3, D-14L-22).
 *         HEIC conversion happens client-side before this route is called (D-14L-23).
 *         Those three gates validate the FILE. The storage KEY is validated separately, by parseDocKey —
 *         an ALLOWLIST over the doc-category slots, so no encoding of `..` can reach the storage path.
 *         See the comment at the call site (BUILD_71 D10).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { validateUpload } from "@/lib/extraction/uploadValidator"
import { createServiceClient } from "@/lib/supabase/server"
import { registerApplicationDocument } from "@/lib/applications/documentRegistry"
import { parseDocKey } from "@/lib/applications/applicationStoragePath"

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

    // ⚠ docKey is caller-supplied and lands in a STORAGE KEY, uploaded with upsert:true. storage-js
    // interpolates the key raw into `${url}/object/${path}` with no encoding, and the WHATWG URL parser
    // then resolves dot segments before fetch sends them — including PERCENT-ENCODED ones. So a literal
    // `..` test does not hold: `%2e%2e/%2e%2e/%2e%2e/{otherOrg}/{app}/id_document` contains no `..` and
    // demonstrably resolves outside this org's prefix. This route uses the service client, so RLS on
    // storage.objects is not a backstop either.
    //
    // ALLOWLIST, not a sanitiser. Binding the built path to its own prefix was tautological here — both
    // sides were built from the same orgId/applicationId, so only docKey was ever constrained. Validating
    // against the closed set of slots the wizard can ask for makes encoding irrelevant: `%2e%2e%2f` is not
    // in the set whatever it decodes to, so there is no decode depth to choose and no layer-mismatch
    // between Next's params, URLSearchParams and the storage SDK. BUILD_71 D10.
    const parsed = parseDocKey(docKey)
    if (!parsed) {
      return NextResponse.json({ error: "Invalid document key" }, { status: 400 })
    }

    const db = await createServiceClient()
    const ext = validation.format === "jpeg" ? "jpg" : validation.format
    // Built from the MATCHED SET MEMBER, never from the raw input — the untrusted string cannot reach the
    // sink even if a decode is introduced anywhere in this chain later.
    const storagePath = `applications/${orgId}/${applicationId}/${parsed.canonical}.${ext}`

    const { error: uploadError } = await db.storage
      .from("application-docs")
      .upload(storagePath, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      return NextResponse.json({ error: "Storage upload failed" }, { status: 500 })
    }

    // Register in the doc→subject registry (14P 0b). The agent uploads for the primary applicant; co/director
    // agent uploads (a subject param) come with §5b. Best-effort — the loader is storage-complete + defaults primary.
    // `parsed.canonical`, not the raw input — identical for every legitimate docKey, and keeps the rule
    // that the untrusted string is never re-used after validation.
    await registerApplicationDocument(db, { orgId, applicationId, subjectRef: "primary", storagePath, documentType: parsed.canonical, uploadedBy: gw.userId })

    return NextResponse.json({ ok: true, storagePath, format: validation.format })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    )
  }
}
