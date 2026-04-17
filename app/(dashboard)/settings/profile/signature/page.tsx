import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { SignatureSettings } from "./SignatureSettings"

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

  const { data: signature } = await db
    .from("user_signatures")
    .select("id, storage_path, source, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()

  let signedUrl: string | null = null

  if (signature) {
    const row = signature as UserSignatureRow
    const { data: urlData } = await db.storage
      .from("signatures")
      .createSignedUrl(row.storage_path, 3600)
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
