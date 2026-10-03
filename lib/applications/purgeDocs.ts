/**
 * lib/applications/purgeDocs.ts — remove every Storage object under an application's prefix.
 *
 * Storage-first deletion: the application row is the only pointer to its docs, so purge the docs BEFORE deleting
 * the row (or they orphan). Returns false if any list/remove failed so the caller can leave the row in place and
 * retry (don't mark done).
 * Notes:  RECURSIVE — a co-applicant's files sit one level down in `co_{id}/` (14R §6). This walked only the top
 *         level until 2026-10-03, so every caller left co-applicant documents behind. It also deleted while paging
 *         by offset, which skipped a page per page removed; it now lists everything first, then removes.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

const PAGE = 100

/** Every object path under `prefix`, descending into folders. Null when any list failed. */
async function listAll(db: SupabaseClient, bucket: string, prefix: string): Promise<string[] | null> {
  const out: string[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data: entries, error } = await db.storage.from(bucket).list(prefix, { limit: PAGE, offset })
    if (error) return null
    for (const e of entries ?? []) {
      if (!e.name || e.name.startsWith(".")) continue
      // A folder is listed as an entry with no object id.
      if (e.id === null) {
        const nested = await listAll(db, bucket, `${prefix}/${e.name}`)
        if (nested === null) return null
        out.push(...nested)
      } else {
        out.push(`${prefix}/${e.name}`)
      }
    }
    if (!entries || entries.length < PAGE) return out
  }
}

export async function purgeApplicationDocs(
  db: SupabaseClient,
  orgId: string,
  appId: string,
  bucket = "application-docs",
): Promise<boolean> {
  const paths = await listAll(db, bucket, `applications/${orgId}/${appId}`)
  if (paths === null) return false
  let ok = true
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + PAGE))
    if (error) ok = false
  }
  return ok
}
