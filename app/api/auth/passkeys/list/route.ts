/**
 * app/api/auth/passkeys/list/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
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
