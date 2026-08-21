/**
 * components/properties/PropertyCards.tsx — the portfolio row shape
 *
 * Data:   PropertyCardData[] from properties/page.tsx (nested active units + leases)
 * Notes:  Active units are those with deleted_at == null (the sole archive marker — D-1); the legacy
 *         is_archived boolean is no longer consulted.
 *         The `PropertyCards` card-grid component that gave this file its name was deleted
 *         2026-08-21 as dead code — `PropertyList` is the live grid and imports only this type.
 *         The file keeps its name because the type is imported by that path; renaming it is a
 *         separate change, not part of a dead-code pass.
 */
export interface PropertyCardData {
  id: string
  name: string
  type: string
  address_line1: string
  city: string
  is_sectional_title?: boolean | null
  units: { id: string; status: string; deleted_at: string | null; asking_rent_cents: number | null; leases: { rent_amount_cents: number; status: string }[] }[]
}
