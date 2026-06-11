/**
 * app/api/legal/accepted-version/route.ts — the signed-in user's latest accepted legal versions
 *
 * Route:  GET /api/legal/accepted-version
 * Auth:   Supabase session (auth.getUser); returns nulls when unauthenticated (no data leak)
 * Data:   tos_acceptances (latest by accepted_at) — service read, scoped to the user
 * Notes:  Lets the advisory PrivacyPolicyBanner check the DB (source of truth) instead of trusting ONLY the
 *         per-browser pleks_privacy_version cookie — which is absent after a fresh login / new browser / cleared
 *         cookies, so a user who genuinely accepted the current version was being nagged spuriously.
 */
import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ privacy: null, terms: null })

  const service = await createServiceClient()
  const { data, error } = await service
    .from("tos_acceptances")
    .select("privacy_version, terms_version")
    .eq("user_id", user.id)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error("[accepted-version] read failed:", error.message)
    return NextResponse.json({ privacy: null, terms: null })
  }
  return NextResponse.json({ privacy: data?.privacy_version ?? null, terms: data?.terms_version ?? null })
}
