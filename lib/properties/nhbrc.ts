/**
 * lib/properties/nhbrc.ts — NHBRC defects-period warranty auto-creation for new builds
 *
 * Auth:   Server-only — called from property creation server action
 * Data:   warranties (insert via service client)
 * Notes:  Every new build in SA carries three NHBRC windows:
 *         3 months roof leak, 12 months workmanship, 5 years structural (D-60B-07).
 *         Rows use source_type='nhbrc_auto' and can be archived individually.
 */
import { addMonths, addYears, formatISO } from "date-fns"
import type { SupabaseClient } from "@supabase/supabase-js"

function toDateStr(d: Date): string {
  return formatISO(d, { representation: "date" })
}

export async function createNHBRCWarranties(
  db: SupabaseClient,
  property: {
    id: string
    org_id: string
    occupation_date: string  // ISO date string
    created_by?: string | null
  },
): Promise<void> {
  const occ = new Date(property.occupation_date)

  const rows = [
    {
      org_id:       property.org_id,
      subject:      "NHBRC Roof Leak Warranty",
      warranty_type: "building_defects",
      property_id:  property.id,
      source_type:  "nhbrc_auto",
      starts_on:    toDateStr(occ),
      expires_on:   toDateStr(addMonths(occ, 3)),
      claim_url:    "https://www.nhbrc.org.za/",
      claim_notes:  "NHBRC 3-month roof leak cover. Claim via the developer first; NHBRC if developer unresponsive.",
      created_by:   property.created_by ?? null,
    },
    {
      org_id:       property.org_id,
      subject:      "NHBRC Workmanship Warranty",
      warranty_type: "building_defects",
      property_id:  property.id,
      source_type:  "nhbrc_auto",
      starts_on:    toDateStr(occ),
      expires_on:   toDateStr(addMonths(occ, 12)),
      claim_url:    "https://www.nhbrc.org.za/",
      claim_notes:  "NHBRC 12-month general workmanship cover.",
      created_by:   property.created_by ?? null,
    },
    {
      org_id:       property.org_id,
      subject:      "NHBRC Structural Warranty",
      warranty_type: "building_defects",
      property_id:  property.id,
      source_type:  "nhbrc_auto",
      starts_on:    toDateStr(occ),
      expires_on:   toDateStr(addYears(occ, 5)),
      claim_url:    "https://www.nhbrc.org.za/",
      claim_notes:  "NHBRC 5-year major structural defect cover.",
      created_by:   property.created_by ?? null,
    },
  ]

  const { error } = await db.from("warranties").insert(rows)
  if (error) {
    console.error("[nhbrc] failed to create NHBRC warranties:", error.message)
  }
}
