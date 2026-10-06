/**
 * lib/applications/documentRegistry.ts — the application_documents registry (ADDENDUM_14P 0b).
 *
 * Notes:  System truth for doc→SUBJECT attribution. registerApplicationDocument is called server-side on every
 *         upload (idempotent on (application_id, storage_path) — a Storage upsert re-upload doesn't add a row).
 *         getApplicationDocumentSubjects gives the loader storage_path→subject_ref so it can tag each downloaded
 *         doc. Storage stays FLAT for now — subject_ref is the attribution; foldering is a later layout change.
 *         Writes are service-side (the public upload paths use the service client); registration is best-effort
 *         (logged, not thrown) because the loader is storage-complete + defaults unregistered files to 'primary'.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function registerApplicationDocument(db: SupabaseClient, args: Readonly<{
  orgId: string; applicationId: string; subjectRef: string; storagePath: string
  documentType?: string | null; uploadedBy?: string | null
}>): Promise<void> {
  // Idempotent: skip if a live row already points at this exact path (re-upload of the same slot, Storage upsert).
  const { data: existing, error: selErr } = await db
    .from("application_documents").select("id")
    .eq("application_id", args.applicationId).eq("storage_path", args.storagePath).is("deleted_at", null)
    .maybeSingle()
  logQueryError("registerApplicationDocument select", selErr)
  if (existing) return
  const { error: insErr } = await db.from("application_documents").insert({
    org_id: args.orgId, application_id: args.applicationId, subject_ref: args.subjectRef,
    storage_path: args.storagePath, document_type: args.documentType ?? null, uploaded_by: args.uploadedBy ?? null,
  })
  logQueryError("registerApplicationDocument insert", insErr)
}

/** Soft-delete the live registry row for a removed file (the applicant took it back before submitting). */
export async function retireApplicationDocument(db: SupabaseClient, args: Readonly<{
  orgId: string; applicationId: string; storagePath: string
}>): Promise<void> {
  const { error } = await db
    .from("application_documents").update({ deleted_at: new Date().toISOString() })
    .eq("org_id", args.orgId).eq("application_id", args.applicationId).eq("storage_path", args.storagePath)
    .is("deleted_at", null)
  logQueryError("retireApplicationDocument update", error)
}

/** A DSAR erasure has removed one subject's files from an application: retire their live rows and redact the path on
 *  every row, live or already retired. The path carries the uploaded filename, which can hold a name or an ID number
 *  (A18's embedded-id hygiene signal), so a soft-delete alone would keep it. Returns false on a failed write. */
export async function eraseSubjectDocumentRows(db: SupabaseClient, args: Readonly<{
  orgId: string; applicationId: string; subjectRef: string; redacted: string
}>): Promise<boolean> {
  const rows = () => db.from("application_documents")
  const { error: delErr } = await rows().update({ deleted_at: new Date().toISOString() })
    .eq("org_id", args.orgId).eq("application_id", args.applicationId).eq("subject_ref", args.subjectRef)
    .is("deleted_at", null)
  logQueryError("eraseSubjectDocumentRows retire", delErr)
  const { error: pathErr } = await rows().update({ storage_path: args.redacted })
    .eq("org_id", args.orgId).eq("application_id", args.applicationId).eq("subject_ref", args.subjectRef)
  logQueryError("eraseSubjectDocumentRows redact", pathErr)
  return !delErr && !pathErr
}

/** storage_path → subject_ref for an application's LIVE registry rows — the loader's attribution source. */
export async function getApplicationDocumentSubjects(db: SupabaseClient, applicationId: string): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("application_documents").select("storage_path, subject_ref")
    .eq("application_id", applicationId).is("deleted_at", null)
  logQueryError("getApplicationDocumentSubjects", error)
  const map = new Map<string, string>()
  for (const r of data ?? []) map.set(r.storage_path as string, r.subject_ref as string)
  return map
}
