/**
 * app/api/leases/[leaseId]/download-document/route.ts — signed download URL for a lease's stored document
 *
 * Route:  GET /api/leases/[leaseId]/download-document
 * Auth:   gateway() (agent session + org membership)
 * Data:   leases (org-scoped via gateway orgId) → documents storage signed URL (1h).
 * Notes:  leaseId is caller-supplied and the response hands back a signed URL, so the leases
 *         lookup MUST filter org_id — the service client bypasses RLS, so the filter is the boundary.
 */
import { NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  const { leaseId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("external_document_path, generated_doc_path")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()
  logQueryError("GET leases", leaseError)

  if (!lease) return NextResponse.json({ error: "Lease not found" }, { status: 404 })

  const docPath = lease.external_document_path ?? lease.generated_doc_path
  if (!docPath) return NextResponse.json({ error: "No document" }, { status: 404 })

  const { data, error: queryError } = await db.storage
    .from("documents")
    .createSignedUrl(docPath, 3600)
  logQueryError("GET documents", queryError)

  return NextResponse.json({ url: data?.signedUrl ?? null })
}
