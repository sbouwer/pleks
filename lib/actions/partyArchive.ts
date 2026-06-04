"use server"

/**
 * lib/actions/partyArchive.ts — list archived (soft-deleted) landlords + tenants for the Archived view
 *
 * Auth:   gateway() read (org-scoped). Restore is handled by PATCH /api/{landlords,tenants} (admin-gated),
 *         mirroring the rest of the landlords/tenants API-route mutations.
 * Data:   landlords / tenants WHERE deleted_at IS NOT NULL (+ contacts for the name).
 * Notes:  Archive is a reversible soft-delete (ADDENDUM_ARCHIVE_VS_ERASE). The active lists filter
 *         deleted_at IS NULL; this reads the complement so an archived party can be found + restored.
 */
import { gateway } from "@/lib/supabase/gateway"
import { contactDisplayName } from "@/lib/contacts/displayName"

export interface ArchivedParty {
  id: string
  contactId: string
  name: string
}

type ContactRow = Parameters<typeof contactDisplayName>[0]

async function fetchArchived(table: "landlords" | "tenants"): Promise<ArchivedParty[]> {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  const { data, error } = await db
    .from(table)
    .select("id, contact_id, contacts(first_name, last_name, company_name, entity_type)")
    .eq("org_id", orgId)
    .not("deleted_at", "is", null)
    .order("updated_at", { ascending: false })
  if (error) {
    console.error(`fetchArchived ${table} failed:`, error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    contactId: r.contact_id as string,
    name: contactDisplayName(r.contacts as unknown as ContactRow),
  }))
}

export async function fetchArchivedLandlords(): Promise<ArchivedParty[]> {
  return fetchArchived("landlords")
}

export async function fetchArchivedTenants(): Promise<ArchivedParty[]> {
  return fetchArchived("tenants")
}
