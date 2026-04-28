import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logAuthEvent } from "@/lib/auth/events"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthenticated", { status: 401 })

  const body = await req.json() as { passkeyId: string }
  const { passkeyId } = body

  const serviceDb = await createServiceClient()

  // Verify ownership before revoking
  const { data: pk } = await serviceDb
    .from("user_passkeys")
    .select("id, label, device_type")
    .eq("id", passkeyId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle()

  if (!pk) return new Response("Not found", { status: 404 })

  await serviceDb
    .from("user_passkeys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", passkeyId)

  await logAuthEvent({
    userId: user.id,
    eventType: "passkey_unenrolled",
    success: true,
    metadata: { label: pk.label, device_type: pk.device_type },
  })

  return Response.json({ ok: true })
}
