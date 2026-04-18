"use server"

import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"

export async function updateContactJuristicFields(params: {
  contactId: string
  juristicType: string | null
  turnoverUnder2m: boolean | null
  assetValueUnder2m: boolean | null
}) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
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
