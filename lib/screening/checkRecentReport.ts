import { createServiceClient } from "@/lib/supabase/server"
import { subDays } from "date-fns"

export interface RecentCheck {
  application_id: string
  fitscore: number
  fitscore_components: Record<string, unknown>
  checked_at: string
  property_address: string
}

export async function getRecentCompletedCheck(
  applicantEmail: string,
  withinDays: number = 30
): Promise<RecentCheck | null> {
  const supabase = await createServiceClient()
  const cutoff = subDays(new Date(), withinDays)

  const { data } = await supabase
    .from("applications")
    .select(`
      id, fitscore, fitscore_components,
      searchworx_checked_at,
      listings(units(unit_number, properties(name)))
    `)
    .eq("applicant_email", applicantEmail)
    .eq("searchworx_check_status", "complete")
    .not("fitscore", "is", null)
    .gte("searchworx_checked_at", cutoff.toISOString())
    .order("searchworx_checked_at", { ascending: false })
    .limit(1)
    .single()

  if (!data) return null

  const listing = data.listings as unknown as { units: { unit_number: string; properties: { name: string } | null } | null } | null
  const address = [listing?.units?.unit_number, listing?.units?.properties?.name].filter(Boolean).join(", ")

  return {
    application_id: data.id,
    fitscore: data.fitscore,
    fitscore_components: data.fitscore_components as Record<string, unknown>,
    checked_at: data.searchworx_checked_at,
    property_address: address,
  }
}
