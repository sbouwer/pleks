"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function assignLandlord(propertyId: string, landlordId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { error } = await supabase
    .from("properties")
    .update({ landlord_id: landlordId })
    .eq("id", propertyId)

  if (error) throw new Error("Failed to assign landlord")
  revalidatePath(`/properties/${propertyId}`)
}

export async function assignManagingAgent(propertyId: string, agentUserId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { error } = await supabase
    .from("properties")
    .update({ managing_agent_id: agentUserId })
    .eq("id", propertyId)

  if (error) throw new Error("Failed to assign managing agent")
  revalidatePath(`/properties/${propertyId}`)
}

export async function assignUnitAgent(unitId: string, agentUserId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { error } = await supabase
    .from("units")
    .update({ assigned_agent_id: agentUserId })
    .eq("id", unitId)

  if (error) throw new Error("Failed to assign agent")
  revalidatePath(`/properties`)
}
