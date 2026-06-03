"use server"

/**
 * lib/actions/supplierArchive.ts — list + reactivate archived (soft-deleted) suppliers
 *
 * Auth:   fetch = gateway() read; reactivate = requireAgentWriteAccess (write gate)
 * Data:   contractors WHERE deleted_at IS NOT NULL (+ contacts for the name) — contractor_view excludes
 *         soft-deleted rows, so the archived list reads the base table directly.
 * Notes:  Archive is a soft delete (ADDENDUM supplier detail). Reactivate clears deleted_at on the
 *         contractor + its contact so it returns to the active list/view.
 */
import { gateway } from "@/lib/supabase/gateway"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { contactDisplayName } from "@/lib/contacts/displayName"

export interface ArchivedSupplier {
  id: string
  contactId: string
  name: string
  supplierType: string | null
}

export async function fetchArchivedSuppliers(): Promise<ArchivedSupplier[]> {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  const { data, error } = await db
    .from("contractors")
    .select("id, contact_id, supplier_type, contacts(first_name, last_name, company_name)")
    .eq("org_id", orgId)
    .not("deleted_at", "is", null)
    .order("updated_at", { ascending: false })
  if (error) {
    console.error("fetchArchivedSuppliers failed:", error.message)
    return []
  }
  return (data ?? []).map((r) => {
    const c = r.contacts as unknown as Parameters<typeof contactDisplayName>[0]
    return {
      id: r.id as string,
      contactId: r.contact_id as string,
      name: contactDisplayName(c),
      supplierType: (r.supplier_type as string | null) ?? null,
    }
  })
}

export async function reactivateSupplier(contractorId: string, contactId: string): Promise<{ ok: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("reactivate_supplier")
  const { db, orgId } = gw
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    db.from("contractors").update({ deleted_at: null }).eq("id", contractorId).eq("org_id", orgId),
    db.from("contacts").update({ deleted_at: null }).eq("id", contactId).eq("org_id", orgId),
  ])
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)?.message }
  return { ok: true }
}
