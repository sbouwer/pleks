/**
 * app/api/applications/[id]/documents/upload-url/route.ts — mint a signed upload URL for one applicant document
 *
 * Route:  POST /api/applications/[id]/documents/upload-url
 * Auth:   applicant token bound to THIS application id (resolveApplicantToken — lead or co), checked first.
 * Data:   application-docs storage (createSignedUploadUrl, service client); applications (org_id)
 * Notes:  DECISIONS 2026-10-03: no storage policy grants anon/authenticated anything on application-docs. The
 *         browser still uploads straight to Storage — Vercel's request-body limit rules out proxying 20 MB through
 *         a route — but with a one-path signed upload token minted here, after the token check. The PATH is built
 *         server-side from a closed slot key + extension inside the caller's OWN subject folder; nothing the
 *         caller sends reaches it as text. Size + MIME are the bucket's limits (011 §22).
 */
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveApplicantToken } from "@/lib/applications/verifyApplicantToken"
import { subjectUploadPath } from "@/lib/applications/applicationStoragePath"
import { checkAiRateLimit } from "@/lib/ai/rateLimit"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await params
  const body = await req.json().catch(() => ({})) as { token?: string; docKey?: string; ext?: string; single?: boolean }
  const service = await createServiceClient()

  const caller = await resolveApplicantToken(service, body.token, applicationId)
  if (!caller) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

  // The org comes from the DB row, never from anything the caller sent.
  // eslint-disable-next-line pleks/require-org-scope-on-service-read -- this read RESOLVES the org: the token above bound the caller to this application id, and there is no caller org on the public apply flow
  const { data: app, error: appErr } = await service.from("applications").select("org_id").eq("id", applicationId).maybeSingle()
  logQueryError("upload-url applications", appErr)
  const orgId = app?.org_id as string | undefined
  if (!orgId) return NextResponse.json({ error: "Application not found" }, { status: 404 })

  const path = subjectUploadPath(orgId, applicationId, caller.subject, body.docKey, body.ext, body.single === true, randomUUID().slice(0, 8))
  if (!path) return NextResponse.json({ error: "This document slot or file type is not accepted." }, { status: 400 })

  // A token holder could otherwise mint upload slots without bound — cap per application per hour.
  if (!(await checkAiRateLimit(service, `upload-url:${applicationId}`, 60, 60)).allowed) {
    return NextResponse.json({ error: "Too many uploads — please wait a moment and try again." }, { status: 429 })
  }

  // upsert: a single slot's re-upload replaces the file at the same canonical path.
  const { data, error } = await service.storage.from("application-docs").createSignedUploadUrl(path, { upsert: true })
  if (error || !data) {
    console.error("upload-url createSignedUploadUrl failed:", error?.message)
    return NextResponse.json({ error: "Could not prepare the upload — please try again." }, { status: 500 })
  }
  return NextResponse.json({ path: data.path, token: data.token })
}
