/**
 * app/api/leases/[leaseId]/download-document/route.ts — signed download URL for a lease's stored document
 *
 * Route:  GET /api/leases/[leaseId]/download-document
 * Auth:   gateway() (agent session + org membership) + the leases capability
 * Data:   leaseDocumentSignedUrl — org-scoped lease read → "documents" storage signed URL (1h).
 * Notes:  leaseId is caller-supplied and the response hands back a signed URL; the helper's lease read filters
 *         org_id, which is the boundary (the service client bypasses RLS). Returns JSON for fetch() callers; the
 *         sibling /document route redirects for plain links.
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"
import { leaseDocumentSignedUrl } from "@/lib/leases/leaseDocumentUrl"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // The document carries the lessee's full ID number: a member without lease access must not open it.
  if (!(await hasCapability(gw, "leases"))) return NextResponse.json({ error: "Leases access is required" }, { status: 403 })

  const doc = await leaseDocumentSignedUrl(gw.db, gw.orgId, leaseId)
  if ("error" in doc) return NextResponse.json({ error: doc.error }, { status: doc.status })
  return NextResponse.json({ url: doc.url })
}
