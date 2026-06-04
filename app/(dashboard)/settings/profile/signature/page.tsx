/**
 * app/(dashboard)/settings/profile/signature/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { SignatureSettings } from "./SignatureSettings"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface UserSignatureRow {
  id: string
  storage_path: string
  source: string
  created_at: string
}

export default async function SignaturePage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, userId } = gw

  const { data: signature, error: signatureError } = await db
    .from("user_signatures")
    .select("id, storage_path, source, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()
    logQueryError("SignaturePage user_signatures", signatureError)

  let signedUrl: string | null = null

  if (signature) {
    const row = signature as UserSignatureRow
    const { data: urlData, error: urlDataError } = await db.storage
      .from("signatures")
      .createSignedUrl(row.storage_path, 3600)
    logQueryError("SignaturePage signatures", urlDataError)
    signedUrl = urlData?.signedUrl ?? null
  }

  const currentSignature =
    signature
      ? {
          id: (signature as UserSignatureRow).id,
          source: (signature as UserSignatureRow).source,
          created_at: (signature as UserSignatureRow).created_at,
          signedUrl,
        }
      : null

  return <SignatureSettings currentSignature={currentSignature} />
}
