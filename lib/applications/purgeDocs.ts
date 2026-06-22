/**
 * lib/applications/purgeDocs.ts — remove every Storage object under an application's prefix.
 *
 * Storage-first deletion: the application row is the only pointer to its docs, so purge the docs BEFORE deleting
 * the row (or they orphan). Paginated + flat (uploads live flat under applications/{orgId}/{appId}/). Returns
 * false if any list/remove failed so the caller can leave the row in place and retry (don't mark done).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export async function purgeApplicationDocs(
  db: SupabaseClient,
  orgId: string,
  appId: string,
  bucket = "application-docs",
): Promise<boolean> {
  const prefix = `applications/${orgId}/${appId}`
  let ok = true
  for (let offset = 0; ; offset += 100) {
    const { data: files, error } = await db.storage.from(bucket).list(prefix, { limit: 100, offset })
    if (error) return false
    if (!files || files.length === 0) return ok
    const paths = files.filter((f) => f.name && !f.name.startsWith(".")).map((f) => `${prefix}/${f.name}`)
    if (paths.length > 0) {
      const { error: rmErr } = await db.storage.from(bucket).remove(paths)
      if (rmErr) ok = false
    }
    if (files.length < 100) return ok
  }
}
