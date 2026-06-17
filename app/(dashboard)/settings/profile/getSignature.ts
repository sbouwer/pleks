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

export type SignatureKind = "signature" | "initial"

export interface CurrentSignature {
  id: string
  source: string
  created_at: string
  signedUrl: string | null
}

async function signedUrlFor(db: Db, storagePath: string): Promise<string | null> {
  const { data, error } = await db.storage.from("signatures").createSignedUrl(storagePath, 3600)
  logQueryError("getUserSignature signed url", error)
  return data?.signedUrl ?? null
}

export async function getUserSignature(db: Db, userId: string, kind: SignatureKind = "signature"): Promise<CurrentSignature | null> {
  const { data: signature, error } = await db
    .from("user_signatures")
    .select("id, storage_path, source, created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("is_active", true)
    .maybeSingle()
  logQueryError("getUserSignature user_signatures", error)
  if (!signature) return null

  const row = signature as { id: string; storage_path: string; source: string; created_at: string }
  return { id: row.id, source: row.source, created_at: row.created_at, signedUrl: await signedUrlFor(db, row.storage_path) }
}

/** Both active marks for a user — the full signature and the initial. */
export async function getUserSignatures(db: Db, userId: string): Promise<{ signature: CurrentSignature | null; initial: CurrentSignature | null }> {
  const { data, error } = await db
    .from("user_signatures")
    .select("id, storage_path, source, created_at, kind")
    .eq("user_id", userId)
    .eq("is_active", true)
  logQueryError("getUserSignatures user_signatures", error)
  const rows = (data ?? []) as Array<{ id: string; storage_path: string; source: string; created_at: string; kind: SignatureKind }>

  async function build(kind: SignatureKind): Promise<CurrentSignature | null> {
    const row = rows.find((r) => r.kind === kind)
    if (!row) return null
    return { id: row.id, source: row.source, created_at: row.created_at, signedUrl: await signedUrlFor(db, row.storage_path) }
  }

  return { signature: await build("signature"), initial: await build("initial") }
}
