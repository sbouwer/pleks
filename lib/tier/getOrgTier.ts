import { createClient } from "@/lib/supabase/server"
import type { Tier } from "@/lib/constants"

// Server-only helper — do NOT import in client components
export async function getOrgTier(orgId: string): Promise<Tier> {
  const supabase = await createClient()
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()
  return (sub?.tier as Tier) ?? "owner"
}
