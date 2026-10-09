/**
 * lib/leases/leaseDocumentUrl.ts — a short-lived signed URL for a lease's stored document (uploaded or generated)
 *
 * Auth:   none of its own — callers pass a db already behind their gate (gateway)
 * Data:   leases.external_document_path / generated_doc_path (org-scoped) → "documents" storage bucket
 * Notes:  leaseId is caller-supplied and the result hands out a signed URL, so the lease read MUST filter org_id —
 *         the service client bypasses RLS, so the filter is the boundary. The uploaded copy wins over the generated
 *         one: once an agency uploads the signed lease, that is the lease. Shared by the JSON download route and the
 *         redirecting "View lease" route so the two cannot disagree about which file a lease's document is.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

const SIGNED_URL_SECONDS = 3600

export type LeaseDocumentUrl = { url: string } | { status: 404 | 500; error: string }

export async function leaseDocumentSignedUrl(db: SupabaseClient, orgId: string, leaseId: string): Promise<LeaseDocumentUrl> {
  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("external_document_path, generated_doc_path")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .maybeSingle()
  logQueryError("leaseDocumentSignedUrl leases", leaseError)
  if (!lease) return { status: 404, error: "Lease not found" }

  const docPath = (lease.external_document_path ?? lease.generated_doc_path) as string | null
  if (!docPath) return { status: 404, error: "No document" }

  const { data, error } = await db.storage.from("documents").createSignedUrl(docPath, SIGNED_URL_SECONDS)
  logQueryError("leaseDocumentSignedUrl documents", error)
  if (!data?.signedUrl) return { status: 500, error: "The document could not be opened. Try again." }
  return { url: data.signedUrl }
}
