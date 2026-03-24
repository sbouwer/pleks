"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createMunicipalAccount(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const propertyId = formData.get("property_id") as string
  const { data: property } = await supabase
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .single()

  if (!property) return { error: "Property not found" }

  const { error } = await supabase.from("municipal_accounts").insert({
    org_id: property.org_id,
    property_id: propertyId,
    account_number: formData.get("account_number") as string,
    municipality_name: formData.get("municipality_name") as string,
    service_address: formData.get("service_address") as string || null,
    account_holder: formData.get("account_holder") as string || null,
    includes_electricity: formData.get("includes_electricity") === "true",
    electricity_prepaid: formData.get("electricity_prepaid") === "true",
  })

  if (error) return { error: error.message }

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}

export async function uploadMunicipalBill(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const propertyId = formData.get("property_id") as string
  const municipalAccountId = formData.get("municipal_account_id") as string
  const file = formData.get("file") as File

  if (!file) return { error: "File required" }

  const { data: property } = await supabase
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .single()

  if (!property) return { error: "Property not found" }

  const sanitized = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
  const storagePath = `${propertyId}/${municipalAccountId}/${Date.now()}-${sanitized}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from("municipal-bills")
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { data: bill, error } = await supabase
    .from("municipal_bills")
    .insert({
      org_id: property.org_id,
      property_id: propertyId,
      municipal_account_id: municipalAccountId,
      pdf_storage_path: storagePath,
      original_filename: file.name,
      file_size_bytes: file.size,
      extraction_status: "pending",
      uploaded_by: user.id,
    })
    .select("id")
    .single()

  if (error || !bill) return { error: error?.message || "Failed to create bill record" }

  // TODO: Trigger Sonnet extraction via Edge Function

  revalidatePath("/payments/municipal")
  return { success: true, billId: bill.id }
}

export async function confirmMunicipalBill(billId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase.from("municipal_bills").update({
    extraction_status: "confirmed",
    agent_confirmed: true,
    confirmed_by: user.id,
    confirmed_at: new Date().toISOString(),
  }).eq("id", billId)

  if (error) return { error: error.message }

  revalidatePath("/payments/municipal")
  return { success: true }
}

export async function markMunicipalBillPaid(billId: string, reference?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase.from("municipal_bills").update({
    payment_status: "paid",
    paid_at: new Date().toISOString(),
    payment_reference: reference || null,
  }).eq("id", billId)

  if (error) return { error: error.message }

  revalidatePath("/payments/municipal")
  return { success: true }
}
