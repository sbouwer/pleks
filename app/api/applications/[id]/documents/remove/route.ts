/**
 * app/api/applications/[id]/documents/remove/route.ts — remove one of the caller's own uploaded documents
 *
 * Route:  POST /api/applications/[id]/documents/remove
 * Auth:   applicant token bound to THIS application id (resolveApplicantToken — lead or co), checked first;
 *         the path must sit in the caller's OWN subject folder (pathBelongsToSubject).
 * Data:   application-docs storage (remove, service client); application_documents (soft-delete the registry row)
 * Notes:  Replaces the browser-client remove(), which needed the anon DELETE policy DECISIONS 2026-10-03 drops.
 *         The /screen pipeline enumerates the whole prefix, so a file the applicant takes back must actually go.
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveApplicantToken } from "@/lib/applications/verifyApplicantToken"
import { pathBelongsToSubject } from "@/lib/applications/applicationStoragePath"
import { retireApplicationDocument } from "@/lib/applications/documentRegistry"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await params
  const body = await req.json().catch(() => ({})) as { token?: string; path?: string }
  const service = await createServiceClient()

  const caller = await resolveApplicantToken(service, body.token, applicationId)
  if (!caller) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

  // eslint-disable-next-line pleks/require-org-scope-on-service-read -- this read RESOLVES the org: the token above bound the caller to this application id, and there is no caller org on the public apply flow
  const { data: app, error: appErr } = await service.from("applications").select("org_id").eq("id", applicationId).maybeSingle()
  logQueryError("documents/remove applications", appErr)
  const orgId = app?.org_id as string | undefined
  if (!orgId || !pathBelongsToSubject(orgId, applicationId, caller.subject, body.path)) {
    return NextResponse.json({ error: "Invalid document path" }, { status: 403 })
  }
  const path = body.path as string

  const { error } = await service.storage.from("application-docs").remove([path])
  if (error) {
    console.error("documents/remove storage remove failed:", error.message)
    return NextResponse.json({ error: "Could not remove the file — please try again." }, { status: 500 })
  }
  await retireApplicationDocument(service, { orgId, applicationId, storagePath: path })
  return NextResponse.json({ ok: true })
}
