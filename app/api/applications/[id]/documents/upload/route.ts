/**
 * app/api/applications/[id]/documents/upload/route.ts — Validated document upload
 *
 * Route:  POST /api/applications/[id]/documents/upload
 * Auth:   requireAgentWriteAccess
 * Data:   application-docs storage (upload)
 * Notes:  Three-gate validation: extension + MIME + magic bytes (§15.3, D-14L-22).
 *         HEIC conversion happens client-side before this route is called (D-14L-23).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { validateUpload } from "@/lib/extraction/uploadValidator"
import { createServiceClient } from "@/lib/supabase/server"

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

    const { error: uploadError } = await db.storage
      .from("application-docs")
      .upload(storagePath, file, { upsert: true, contentType: file.type })

    if (uploadError) {
      return NextResponse.json({ error: "Storage upload failed" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, storagePath, format: validation.format })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    )
  }
}
