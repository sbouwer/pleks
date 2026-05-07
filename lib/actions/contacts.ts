"use server"

/**
 * lib/actions/contacts.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"

export async function updateContactJuristicFields(params: {
  contactId: string
  juristicType: string | null
  turnoverUnder2m: boolean | null
  assetValueUnder2m: boolean | null
}) {
  const gw = await requireAgentWriteAccess("edit_tenant")
  const { db, orgId } = gw

  // Verify the contact belongs to this org (via tenant or landlord)
  const { data: contact } = await db
    .from("contacts")
    .select("id")
    .eq("id", params.contactId)
    .eq("org_id", orgId)
    .single()

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
