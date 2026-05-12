/**
 * components/properties/WarrantiesCard.tsx — Server-component wrapper: fetches active/archived warranties and renders WarrantiesCardClient
 *
 * Auth:   gatewaySSR (server component, no subscription gate on reads)
 * Data:   warranties table (property-scoped or unit-scoped)
 * Notes:  Self-contained data fetch — import and render with propertyId (+ optional unitId).
 *         Client interactivity (add, archive, toggle) is in WarrantiesCardClient.
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { WarrantiesCardClient, type WarrantyRow } from "./WarrantiesCardClient"

interface Props {
  propertyId: string
  unitId?: string | null
}

export async function WarrantiesCard({ propertyId, unitId }: Readonly<Props>) {
  const gw = await gatewaySSR()
  if (!gw) return null

  const { db, orgId } = gw

  let q = db
    .from("warranties")
    .select("id, subject, warranty_type, expires_on, starts_on, manufacturer_name, archived_at, claim_phone, claim_email, claim_url, claim_notes, notes, source_type")
    .eq("org_id", orgId)
    .eq("property_id", propertyId)

  if (unitId) {
    q = q.eq("unit_id", unitId)
  }

  const { data, error } = await q
    .order("expires_on", { ascending: true, nullsFirst: false })
    .limit(50)

  if (error) {
    console.error("[WarrantiesCard] fetch failed:", error.message)
    return null
  }

  const warranties = (data ?? []) as WarrantyRow[]
  const active   = warranties.filter((w) => !w.archived_at)
  const archived = warranties.filter((w) => !!w.archived_at)

  return (
    <WarrantiesCardClient
      propertyId={propertyId}
      unitId={unitId ?? null}
      active={active}
      archived={archived}
    />
  )
}
