"use server"

/**
 * lib/actions/contacts.ts — contact-level server actions (juristic / CPA classification)
 *
 * Auth:   requireAgentWriteAccess (agent write gate + subscription lockdown)
 * Data:   contacts (juristic_type + turnover/asset-band fields); org-scoped, revalidates the detail path
 * Notes:  CPA applicability inputs (ADDENDUM_04A) — set on the contact behind a tenant/landlord.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function updateContactJuristicFields(params: {
  contactId: string
  juristicType: string | null
  turnoverUnder2m: boolean | null
  assetValueUnder2m: boolean | null
}) {
  const gw = await requireAgentWriteAccess("edit_tenant")
  const { db, orgId } = gw

  // Verify the contact belongs to this org (via tenant or landlord)
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .select("id")
    .eq("id", params.contactId)
    .eq("org_id", orgId)
    .single()
    logQueryError("updateContactJuristicFields contacts", contactError)

  if (!contact) return { error: "Contact not found" }

  const { error } = await db
    .from("contacts")
    .update({
      juristic_type: params.juristicType,
      turnover_under_2m: params.turnoverUnder2m,
      asset_value_under_2m: params.assetValueUnder2m,
      size_bands_captured_at:
        params.turnoverUnder2m !== null || params.assetValueUnder2m !== null
          ? new Date().toISOString()
          : null,
    })
    .eq("id", params.contactId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  revalidatePath(`/tenants`)
  return { success: true }
}
