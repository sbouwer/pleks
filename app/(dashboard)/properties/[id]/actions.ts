"use server"

/**
 * app/(dashboard)/properties/[id]/actions.ts — reassign a property's landlord / managing agent / unit agent
 *
 * Auth:   gateway() (agent session + org membership) — "use server" actions are directly POSTable, so each
 *         asserts its own gate and org-scopes the target row.
 * Data:   properties / units, updated WHERE id = target AND org_id = session org.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess (reassigning within an
 *         existing property is "your data, always"). The .eq("org_id", orgId) filter closes a prior
 *         cross-org write hole — these actions previously updated by id only, so any authenticated member
 *         could reassign another org's property/unit.
 */
import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function assignLandlord(propertyId: string, landlordId: string | null) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { error } = await db
    .from("properties")
    .update({ landlord_id: landlordId })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (error) throw new Error("Failed to assign landlord")
  revalidatePath(`/properties/${propertyId}`)
}

export async function assignManagingAgent(propertyId: string, agentUserId: string | null) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { error } = await db
    .from("properties")
    .update({ managing_agent_id: agentUserId })
    .eq("id", propertyId)
    .eq("org_id", orgId)

  if (error) throw new Error("Failed to assign managing agent")
  revalidatePath(`/properties/${propertyId}`)
}

export async function assignUnitAgent(unitId: string, agentUserId: string | null) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { error } = await db
    .from("units")
    .update({ assigned_agent_id: agentUserId })
    .eq("id", unitId)
    .eq("org_id", orgId)

  if (error) throw new Error("Failed to assign agent")
  revalidatePath(`/properties`)
}
