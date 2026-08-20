"use server"

/**
 * lib/actions/municipal.ts — municipal account + bill server actions (create, upload + AI extraction, confirm, mark paid)
 *
 * Auth:   requireAgentWriteAccess("edit_property") on every action; each caller-supplied id is org-scoped
 *         to the caller's orgId (the service client bypasses RLS, so .eq("org_id", orgId) IS the boundary).
 * Data:   municipal_accounts, municipal_bills, properties; municipal-bills storage bucket; Sonnet extraction.
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"

export async function confirmMunicipalBill(billId: string) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, userId, orgId } = gw

  const { error } = await db.from("municipal_bills").update({
    extraction_status: "confirmed",
    agent_confirmed: true,
    confirmed_by: userId,
    confirmed_at: new Date().toISOString(),
  }).eq("id", billId).eq("org_id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/billing/municipal")
  return { success: true }
}

export async function markMunicipalBillPaid(billId: string, reference?: string) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId } = gw

  const { error } = await db.from("municipal_bills").update({
    payment_status: "paid",
    paid_at: new Date().toISOString(),
    payment_reference: reference || null,
  }).eq("id", billId).eq("org_id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/billing/municipal")
  return { success: true }
}
