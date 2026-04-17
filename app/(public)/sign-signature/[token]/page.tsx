import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { SignaturePadCapture } from "./SignaturePadCapture"

interface Props {
  params: Promise<{ token: string }>
}

export default async function SignSignaturePage({ params }: Readonly<Props>) {
  const { token } = await params
  const supabase = await createServiceClient()

  // Validate token
  const { data: tokenRow, error } = await supabase
    .from("signature_sign_tokens")
    .select("token, user_id, org_id, expires_at, consumed_at")
    .eq("token", token)
    .single()

  if (error || !tokenRow) return notFound()

  // Already consumed
  if (tokenRow.consumed_at) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Signature already captured</p>
          <p className="text-sm text-muted-foreground">
            This link has already been used. Return to Pleks to confirm your signature.
          </p>
        </div>
      </div>
    )
  }

  // Expired
  if (new Date(tokenRow.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Link expired</p>
          <p className="text-sm text-muted-foreground">
            This link expired after 10 minutes. Generate a new QR code in Settings → Signature.
          </p>
        </div>
      </div>
    )
  }

  return (
    <SignaturePadCapture
      token={token}
      userId={tokenRow.user_id}
      orgId={tokenRow.org_id}
    />
  )
}
