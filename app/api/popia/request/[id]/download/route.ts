/**
 * app/api/popia/request/[id]/download/route.ts — Get signed download URLs for a POPIA export
 *
 * Route:  GET /api/popia/request/:id/download
 * Auth:   Subject (owns the request) or agency staff
 * Data:   popia_exports (SELECT + UPDATE download_count)
 * Notes:  Returns signed URLs with 7-day TTL. Records first download timestamp.
 *         D-POPIA-12: export must exist (generated at approval time). If not, 404.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { recordDownload } from "@/lib/popia/export"
import { signedDownloadUrl } from "@/lib/exports/bundle"

const TTL = 7 * 24 * 60 * 60  // 7 days in seconds

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = createServiceClient()

  // Load the request
  const { data: request, error } = await (await db)
    .from("data_subject_requests")
    .select("org_id, subject_user_id, subject_email, export_id")
    .eq("id", id)
    .single()

  if (error || !request) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Auth check
  const isSubject =
    request.subject_user_id === user.id ||
    (request.subject_email as string)?.toLowerCase() === user.email?.toLowerCase()

  const { data: membership } = await (await db)
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", request.org_id)
    .is("deleted_at", null)
    .single()

  if (!isSubject && !membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!request.export_id) {
    return NextResponse.json({ error: "No export generated for this request yet" }, { status: 404 })
  }

  // Load export
  const { data: popia_export } = await (await db)
    .from("popia_exports")
    .select("id, pdf_storage_path, json_storage_path, zip_storage_path, manifest_hash, expires_at")
    .eq("id", request.export_id)
    .single()

  if (!popia_export) return NextResponse.json({ error: "Export not found" }, { status: 404 })

  if (new Date(popia_export.expires_at) < new Date()) {
    return NextResponse.json({ error: "Export link has expired — request a regeneration" }, { status: 410 })
  }

  const [pdf_url, json_url, zip_url] = await Promise.all([
    signedDownloadUrl("popia-exports", popia_export.pdf_storage_path, TTL),
    signedDownloadUrl("popia-exports", popia_export.json_storage_path, TTL),
    popia_export.zip_storage_path
      ? signedDownloadUrl("popia-exports", popia_export.zip_storage_path, TTL)
      : Promise.resolve(null),
  ])

  await recordDownload(popia_export.id)

  return NextResponse.json({
    manifest_hash: popia_export.manifest_hash,
    expires_at: popia_export.expires_at,
    pdf_url,
    json_url,
    zip_url,
  })
}
