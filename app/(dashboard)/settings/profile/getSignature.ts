/**
 * app/(dashboard)/settings/profile/getSignature.ts — load the user's active signature (+ signed URL)
 *
 * Auth:   caller passes the gateway db + userId
 * Data:   user_signatures (active row) → signed URL from the `signatures` storage bucket
 * Notes:  Shared by the My profile Signature tab and the standalone signature route. Returns null when
 *         the user has no active signature yet.
 */
import type { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

type Db = Awaited<ReturnType<typeof createServiceClient>>

export interface CurrentSignature {
  id: string
  source: string
  created_at: string
  signedUrl: string | null
}

export async function getUserSignature(db: Db, userId: string): Promise<CurrentSignature | null> {
  const { data: signature, error } = await db
    .from("user_signatures")
    .select("id, storage_path, source, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()
  logQueryError("getUserSignature user_signatures", error)
  if (!signature) return null

  const row = signature as { id: string; storage_path: string; source: string; created_at: string }
  const { data: urlData, error: urlErr } = await db.storage
    .from("signatures")
    .createSignedUrl(row.storage_path, 3600)
  logQueryError("getUserSignature signed url", urlErr)

  return { id: row.id, source: row.source, created_at: row.created_at, signedUrl: urlData?.signedUrl ?? null }
}
