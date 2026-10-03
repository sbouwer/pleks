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
import { logQueryError } from "@/lib/supabase/logQueryError"
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_LABEL } from "@/lib/constants"

// The municipal-bills bucket's limits (011 §29). Not exported — a "use server" module exports async functions only.
// PDF only: extractMunicipalBill sends every bill to the model as application/pdf, so an image would store and then
// always fail extraction.
const MUNICIPAL_BILL_TYPES = new Set(["application/pdf"])

/**
 * @knipignore The missing ENTRY half of a LIVE feature: confirmMunicipalBill/markMunicipalBillPaid in this
 * same file are wired to MunicipalBillActions.tsx. As at 2026-08-21 no UI path creates an account
 * or uploads a bill — deleting these strands the live half.
 */
export async function createMunicipalAccount(formData: FormData) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, orgId } = gw

  // Org-scope the property read (caller-ID census): a foreign propertyId matches no row, so the account
  // can't be planted in another org via the fetched property.org_id.
  const propertyId = formData.get("property_id") as string
  const { data: property, error: propertyError } = await db
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .single()
    logQueryError("createMunicipalAccount properties", propertyError)

  if (!property) return { error: "Property not found" }

  const { error } = await db.from("municipal_accounts").insert({
    org_id: orgId,
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

/**
 * @knipignore See createMunicipalAccount above — the same unwired entry half of a live municipal-bill flow.
 */
export async function uploadMunicipalBill(formData: FormData) {
  const gw = await requireAgentWriteAccess("edit_property")
  const { db, userId, orgId } = gw

  const propertyId = formData.get("property_id") as string
  const municipalAccountId = formData.get("municipal_account_id") as string
  const file = formData.get("file") as File

  if (!file) return { error: "File required" }
  // Mirrors the bucket's own limits (011 §29); checked here too so the agent gets a readable message, not a 4xx.
  if (!MUNICIPAL_BILL_TYPES.has(file.type)) return { error: "Upload the bill as a PDF" }
  if (file.size > UPLOAD_MAX_BYTES) return { error: `File too large (max ${UPLOAD_MAX_LABEL})` }

  // Org-scope the property read (caller-ID census) — foreign propertyId matches nothing, so the bill +
  // storage object + AI extraction can't be driven against another org.
  const { data: property, error: propertyError } = await db
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .single()
    logQueryError("uploadMunicipalBill properties", propertyError)

  if (!property) return { error: "Property not found" }

  const sanitized = file.name.replaceAll(/[^a-zA-Z0-9.-]/g, "_")
  // `{org}/` first, like the other org-scoped buckets, so the org purge CAN remove it by prefix — it does not yet list
  // this bucket (follow-up to PR #335's ORG_SCOPED_BUCKETS). It began at the property id
  // until 2026-10-03; the bucket did not exist then, so no object has the old key.
  const storagePath = `${orgId}/${propertyId}/${municipalAccountId}/${Date.now()}-${sanitized}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from("municipal-bills")
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { data: bill, error } = await db
    .from("municipal_bills")
    .insert({
      org_id: orgId,
      property_id: propertyId,
      municipal_account_id: municipalAccountId,
      pdf_storage_path: storagePath,
      original_filename: file.name,
      file_size_bytes: file.size,
      extraction_status: "pending",
      uploaded_by: userId,
    })
    .select("id")
    .single()

  if (error || !bill) return { error: error?.message || "Failed to create bill record" }

  // Run Sonnet extraction synchronously — update status before and after
  await db.from("municipal_bills").update({ extraction_status: "extracting" }).eq("id", bill.id)
  try {
    const { extractMunicipalBill } = await import("@/lib/ai/municipalBillExtraction")
    const extracted = await extractMunicipalBill(buffer)
    await db.from("municipal_bills").update({
      extraction_status: "extracted",
      extracted_at: new Date().toISOString(),
      ...extracted,
    }).eq("id", bill.id)
  } catch (err) {
    console.error("[uploadMunicipalBill] extraction failed:", err)
    await db.from("municipal_bills").update({
      extraction_status: "failed",
      extraction_notes: String(err),
    }).eq("id", bill.id)
  }

  revalidatePath("/billing/municipal")
  return { success: true, billId: bill.id }
}

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
