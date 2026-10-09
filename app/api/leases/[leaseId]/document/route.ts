/**
 * app/api/leases/[leaseId]/document/route.ts — open a lease's stored document ("View lease")
 *
 * Route:  GET /api/leases/[leaseId]/document
 * Auth:   gateway() (agent session + org membership)
 * Data:   leaseDocumentSignedUrl — org-scoped lease read → "documents" storage signed URL (1h)
 * Notes:  A plain link target, so it REDIRECTS to the signed URL instead of returning JSON like download-document.
 *         The lease detail page linked here from before the route existed (arc 2: dead link).
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { leaseDocumentSignedUrl } from "@/lib/leases/leaseDocumentUrl"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const doc = await leaseDocumentSignedUrl(gw.db, gw.orgId, leaseId)
  if ("error" in doc) return NextResponse.json({ error: doc.error }, { status: doc.status })
  return NextResponse.redirect(doc.url, 302)
}
