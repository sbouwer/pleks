/**
 * lib/applications/purgeDocs.ts — remove Storage objects under a prefix: an application's, one subject's, or an org's.
 *
 * Auth:   none (pure helper) — callers pass the service client; every prefix is built from DB-resolved ids.
 * Data:   Supabase Storage (`application-docs` by default).
 * Notes:  Storage-first deletion: the application row is the only pointer to its docs, so purge the docs BEFORE deleting
 *         the row (or they orphan). Every helper returns false if any list/remove failed so the caller can leave the row
 *         in place and retry (don't mark done).
 *         RECURSIVE where it must be — a co-applicant's files sit one level down in `co_{id}/` (14R §6), and an org's
 *         files sit several levels down. This walked only the top level until 2026-10-03, so every application caller
 *         left co-applicant documents behind and the org purge removed nothing in a nested bucket (it "removed" folder
 *         names, a no-op). It also deleted while paging by offset, which skipped a page per page removed; it now lists
 *         everything first, then removes.
 *         `purgeSubjectDocs` is deliberately NOT recursive: a DSAR erases ONE person, and the lead's folder contains
 *         every co's `co_{id}/` folder — other people's documents.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ApplicantSubject } from "./applicationStoragePath"

const PAGE = 100

/** Every object path under `prefix` — descending into folders when `recursive`, skipping them otherwise. Null when
 *  any list failed. */
async function listAll(db: SupabaseClient, bucket: string, prefix: string, recursive: boolean): Promise<string[] | null> {
  const out: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data: entries, error } = await db.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) return null
    for (const e of entries ?? []) {
      if (!e.name || e.name.startsWith(".")) continue
      // A folder is listed as an entry with no object id.
      if (e.id === null) {
        if (!recursive) continue
        const nested = await listAll(db, bucket, `${prefix}/${e.name}`, true)
        if (nested === null) return null
        out.push(...nested)
      } else {
        out.push(`${prefix}/${e.name}`)
      }
    }
    if (!entries || entries.length < PAGE) return out
  }
}

/** Remove every object under `prefix` (no trailing slash). True when there was nothing to remove. */
export async function purgeStoragePrefix(
  db: SupabaseClient,
  bucket: string,
  prefix: string,
  recursive = true,
): Promise<boolean> {
  const paths = await listAll(db, bucket, prefix, recursive)
  if (paths === null) return false
  let ok = true
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + PAGE))
    if (error) ok = false
  }
  return ok
}

/** Every document of an application — the lead's and every co's. */
export async function purgeApplicationDocs(
  db: SupabaseClient,
  orgId: string,
  appId: string,
  bucket = "application-docs",
): Promise<boolean> {
  return purgeStoragePrefix(db, bucket, `applications/${orgId}/${appId}`)
}

/** One subject's own documents on one application: the files directly in the lead's root, or in a co's `co_{id}/`
 *  folder. Never another party's. */
export async function purgeSubjectDocs(
  db: SupabaseClient,
  orgId: string,
  appId: string,
  subject: ApplicantSubject,
): Promise<boolean> {
  const root = `applications/${orgId}/${appId}`
  return purgeStoragePrefix(db, "application-docs", subject.kind === "lead" ? root : `${root}/co_${subject.coId}`, false)
}

/** A DSAR subject's own documents across every application they LEAD — root files only, each `co_{id}/` left alone.
 *  The one entry point erasure uses, so the lead-only rule is tested here rather than at the call site. */
export async function eraseLeadDocs(
  db: SupabaseClient,
  orgId: string,
  applicationIds: string[],
): Promise<{ purged: string[]; failed: string[] }> {
  const purged: string[] = []
  const failed: string[] = []
  for (const appId of applicationIds) {
    if (await purgeSubjectDocs(db, orgId, appId, { kind: "lead" })) purged.push(appId)
    else failed.push(appId)
  }
  return { purged, failed }
}

/** A DSAR subject's own documents as a CO-applicant: each `co_{id}/` folder, never the lead's root or another co's. */
export async function eraseCoDocs(
  db: SupabaseClient,
  orgId: string,
  coApplicants: Array<{ id: string; applicationId: string }>,
): Promise<{ purged: string[]; failed: string[] }> {
  const purged: string[] = []
  const failed: string[] = []
  for (const co of coApplicants) {
    if (await purgeSubjectDocs(db, orgId, co.applicationId, { kind: "co", coId: co.id })) purged.push(co.id)
    else failed.push(co.id)
  }
  return { purged, failed }
}

/** Every application document an org holds, including those of applications whose rows are already gone. */
export async function purgeOrgApplicationDocs(db: SupabaseClient, orgId: string): Promise<boolean> {
  return purgeStoragePrefix(db, "application-docs", `applications/${orgId}`)
}
