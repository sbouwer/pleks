/**
 * app/api/auth/passkeys/list/route.ts — list the current user's passkeys for this host
 *
 * Route:  GET /api/auth/passkeys/list
 * Auth:   auth.getUser() (cookie client)
 * Data:   reads user_passkeys (service client) scoped by user_id + rp_id, revoked_at IS NULL
 * Notes:  rp_id is host-derived (app.pleks.co.za vs localhost) — passkeys are per-host
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthenticated", { status: 401 })

  const rpId = new URL(req.url).hostname === "app.pleks.co.za"
    ? "app.pleks.co.za"
    : "localhost"

  const serviceDb = await createServiceClient()
  const { data: passkeys, error } = await serviceDb
    .from("user_passkeys")
    .select("id, label, device_type, last_used_at, created_at")
    .eq("user_id", user.id)
    .eq("rp_id", rpId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })

  if (error) return Response.json({ passkeys: [] })
  return Response.json({ passkeys: passkeys ?? [] })
}
